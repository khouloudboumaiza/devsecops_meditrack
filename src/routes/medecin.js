// Écrans médecin : tableau de bord, recherche de patients, fiche patient, ajout d'actes (diagnostic, ordonnance, notes)
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { today, wrap, redirectWithToast, renderError } = require('../utils');

const router = express.Router();
const only = requireRole('medecin');

// ============================================================
// 1. Tableau de bord Médecin (inspiré de la capture Hospital App)
// ============================================================
router.get('/medecin', only, wrap(async (req, res) => {
  const t = today();

  // Statistiques KPI du médecin
  const stats = (await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE date = $2 AND statut <> 'annule') AS aujourdhui,
       COUNT(*) FILTER (WHERE date >= $2 AND statut = 'confirme') AS a_venir,
       COUNT(*) FILTER (WHERE statut = 'termine') AS termines,
       COUNT(DISTINCT patient_id) AS patients
     FROM appointments
     WHERE medecin_id = $1`,
    [req.user.id, t]
  )).rows[0];

  // Rendez-vous du jour
  const todayAppts = (await db.query(
    `SELECT a.*, u.nom AS patient_nom, u.email AS patient_email
       FROM appointments a
       JOIN users u ON u.id = a.patient_id
      WHERE a.medecin_id = $1 AND a.date = $2 AND a.statut <> 'annule'
      ORDER BY a.heure`,
    [req.user.id, t]
  )).rows;

  // Patients récents suivis par ce médecin
  const recentPatients = (await db.query(
    `SELECT DISTINCT ON (u.id) u.id, u.nom, u.email, a.date AS dernier_rdv, a.statut AS dernier_statut
       FROM appointments a
       JOIN users u ON u.id = a.patient_id
      WHERE a.medecin_id = $1
      ORDER BY u.id, a.date DESC
      LIMIT 6`,
    [req.user.id]
  )).rows;

  res.render('pages/doctor-dashboard', {
    title: 'Tableau de bord Médecin',
    stats,
    today: todayAppts,
    recentPatients
  });
}));

// ============================================================
// 2. Recherche de patients (contient volontairement VULN-01)
// ============================================================
router.get('/medecin/patients', only, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  let patients;
  let error = null;

  if (!q) {
    patients = (await db.query("SELECT id, nom, email FROM users WHERE role = 'patient' ORDER BY nom LIMIT 20")).rows;
  } else {
    // VULN-01 : injection SQL - l'entrée utilisateur est concaténée directement dans la requête (pas de requête paramétrée)
    const sql = "SELECT id, nom, email FROM users WHERE role = 'patient' AND nom ILIKE '%" + q + "%' ORDER BY nom";
    try {
      patients = (await db.query(sql)).rows;
    } catch (e) {
      console.error('Erreur de recherche :', e.message);
      patients = [];
      error = 'La recherche a échoué. Vérifiez votre saisie.';
    }
  }
  res.render('pages/doctor-patients', { title: 'Patients', q, patients, error });
}));

// ============================================================
// 3. Fiche Dossier Patient (Consultation & Ajout d'actes)
// ============================================================
router.get('/medecin/patients/:id', only, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const patient = (await db.query(`
    SELECT u.id, u.nom, u.email, u.date_naissance, u.created_at,
           m.id AS medecin_id, m.nom AS medecin_nom, m.specialite AS medecin_specialite, m.email AS medecin_email
      FROM users u
      LEFT JOIN users m ON m.id = u.medecin_traitant_id
     WHERE u.id = $1 AND u.role = 'patient'
  `, [id])).rows[0];
  if (!patient) return renderError(res, 404, 'Patient introuvable', "Ce patient n'existe pas.");

  // Historique complet des dossiers médicaux (les notes sont accessibles au médecin)
  const records = (await db.query(
    'SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC, id DESC',
    [id]
  )).rows;

  // Historique des ordonnances indépendantes
  const ordonnances = (await db.query(
    `SELECT o.id, o.diagnostic_associe, o.date_creation, m.nom AS medecin_nom
       FROM ordonnances o
       JOIN users m ON m.id = o.medecin_id
      WHERE o.patient_id = $1
      ORDER BY o.date_creation DESC`,
    [id]
  )).rows;

  // Historique des rendez-vous avec ce médecin
  const appts = (await db.query(
    'SELECT * FROM appointments WHERE patient_id = $1 AND medecin_id = $2 ORDER BY date DESC, heure DESC',
    [id, req.user.id]
  )).rows;

  res.render('pages/doctor-patient', {
    title: patient.nom,
    patient,
    records,
    ordonnances,
    appts
  });
}));

// ============================================================
// 4. Formulaire dédié : Rédiger une nouvelle ordonnance
// ============================================================
router.get('/medecin/patients/:id/nouvelle-ordonnance', only, wrap(async (req, res) => {
  const patientId = parseInt(req.params.id, 10) || 0;
  const patient = (await db.query("SELECT id, nom, email, date_naissance FROM users WHERE id = $1 AND role = 'patient'", [patientId])).rows[0];
  if (!patient) return renderError(res, 404, 'Patient introuvable', "Ce patient n'existe pas.");

  res.render('pages/medecin/nouvelle-ordonnance', {
    title: `Nouvelle ordonnance – ${patient.nom}`,
    patient
  });
}));

router.post('/medecin/patients/:id/ordonnances', only, wrap(async (req, res) => {
  const patientId = parseInt(req.params.id, 10) || 0;
  const patient = (await db.query("SELECT id, nom FROM users WHERE id = $1 AND role = 'patient'", [patientId])).rows[0];
  if (!patient) return renderError(res, 404, 'Patient introuvable', "Ce patient n'existe pas.");

  const diagnosticAssocie = String(req.body.diagnostic_associe || '').trim();
  const contenu = String(req.body.contenu || '').trim();

  if (contenu.length < 5) {
    return redirectWithToast(res, `/medecin/patients/${patientId}/nouvelle-ordonnance`, "Le contenu de l'ordonnance doit être renseigné (min. 5 caractères).", 'error');
  }

  // Création unique et immuable de l'ordonnance
  const { rows } = await db.query(
    'INSERT INTO ordonnances (patient_id, medecin_id, diagnostic_associe, contenu, date_creation) VALUES ($1, $2, $3, $4, now()) RETURNING id',
    [patientId, req.user.id, diagnosticAssocie || null, contenu]
  );

  // Redirection immédiate vers la page officielle de cette nouvelle ordonnance
  redirectWithToast(res, `/ordonnances/${rows[0].id}`, 'Ordonnance créée avec succès. Vous pouvez maintenant l\'imprimer.');
}));

// ============================================================
// 5. Ajouter un acte médical général (Diagnostic, Notes)
// ============================================================
router.post('/medecin/patients/:id/record', only, wrap(async (req, res) => {
  const patientId = parseInt(req.params.id, 10) || 0;
  const patient = (await db.query("SELECT id, nom FROM users WHERE id = $1 AND role = 'patient'", [patientId])).rows[0];
  if (!patient) return renderError(res, 404, 'Patient introuvable', "Ce patient n'existe pas.");

  const diagnostic = String(req.body.diagnostic || '').trim();
  const ordonnance = String(req.body.ordonnance || '').trim();
  const notesTexte = String(req.body.notes || '').trim();

  if (!diagnostic && !ordonnance && !notesTexte) {
    return redirectWithToast(res, `/medecin/patients/${patientId}`, 'Veuillez saisir au moins un diagnostic, une ordonnance ou une note.', 'error');
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const noteFormattee = notesTexte ? `[${dateStr}] ${req.user.nom} : ${notesTexte}` : null;

  await db.query(
    'INSERT INTO medical_records (patient_id, diagnostic, ordonnance, notes, created_at) VALUES ($1, $2, $3, $4, now())',
    [patientId, diagnostic || null, ordonnance || null, noteFormattee]
  );

  redirectWithToast(res, `/medecin/patients/${patientId}`, 'Acte médical enregistré avec succès dans le dossier.');
}));

// ============================================================
// 5. Statut rapide de rendez-vous depuis le tableau de bord
// ============================================================
router.post('/medecin/rendez-vous/:id/statut', only, wrap(async (req, res) => {
  const apptId = parseInt(req.params.id, 10);
  const statut = String(req.body.statut || '').trim();

  if (!['confirme', 'termine', 'annule'].includes(statut)) {
    return redirectWithToast(res, '/medecin', 'Statut invalide.', 'error');
  }

  await db.query(
    'UPDATE appointments SET statut = $1 WHERE id = $2 AND medecin_id = $3',
    [statut, apptId, req.user.id]
  );

  redirectWithToast(res, '/medecin', 'Statut mis à jour.');
}));

module.exports = router;
