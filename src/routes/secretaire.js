// Espace Secrétaire : gestion de l'agenda et des rendez-vous du médecin rattaché
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { today, CRENEAUX, bookableDays, wrap, redirectWithToast, renderError } = require('../utils');

const router = express.Router();
const onlySecretaire = requireRole('secretaire');

/** Récupère les informations du médecin rattaché à la secrétaire connectée. */
async function getAssignedDoctor(medecinId) {
  if (!medecinId) return null;
  const { rows } = await db.query(
    "SELECT id, nom, specialite, note, tarif, email FROM users WHERE id = $1 AND role = 'medecin'",
    [medecinId]
  );
  return rows[0] || null;
}

/** Créneaux déjà pris pour un médecin, sous forme "AAAA-MM-JJ|HH:MM". */
async function bookedSet(medecinId) {
  const { rows } = await db.query(
    "SELECT date, heure FROM appointments WHERE medecin_id = $1 AND statut <> 'annule' AND date >= $2",
    [medecinId, today()]
  );
  return new Set(rows.map((r) => r.date + '|' + r.heure));
}

// ============================================================
// 1. Tableau de bord & Agenda du médecin rattaché
// ============================================================
router.get('/secretaire', onlySecretaire, wrap(async (req, res) => {
  const doc = await getAssignedDoctor(req.user.medecin_id);
  if (!doc) {
    return renderError(res, 400, 'Médecin non assigné', 'Votre compte secrétaire n\'est rattaché à aucun médecin.');
  }

  const t = today();

  // Statistiques de l'agenda
  const statsQuery = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE date = $2 AND statut = 'confirme') AS aujourdhui,
       COUNT(*) FILTER (WHERE date >= $2 AND date <= ($2::date + 7) AND statut = 'confirme') AS semaine,
       COUNT(*) FILTER (WHERE statut = 'termine') AS termines,
       COUNT(DISTINCT patient_id) AS total_patients
     FROM appointments
     WHERE medecin_id = $1`,
    [doc.id, t]
  );
  const stats = statsQuery.rows[0];

  // Rendez-vous d'aujourd'hui
  const todayAppts = (await db.query(
    `SELECT a.*, u.nom AS patient_nom, u.email AS patient_email
       FROM appointments a
       JOIN users u ON u.id = a.patient_id
      WHERE a.medecin_id = $1 AND a.date = $2
      ORDER BY a.heure`,
    [doc.id, t]
  )).rows;

  // Prochains rendez-vous de la semaine (filtrés par statut si demandé)
  const filterStatut = String(req.query.statut || 'tous');
  let weekSql = `SELECT a.*, u.nom AS patient_nom, u.email AS patient_email
                   FROM appointments a
                   JOIN users u ON u.id = a.patient_id
                  WHERE a.medecin_id = $1 AND a.date >= $2 AND a.date <= ($2::date + 7)`;
  const params = [doc.id, t];
  if (filterStatut !== 'tous' && ['confirme', 'termine', 'annule'].includes(filterStatut)) {
    params.push(filterStatut);
    weekSql += ` AND a.statut = $${params.length}`;
  }
  weekSql += ' ORDER BY a.date, a.heure';
  const weekAppts = (await db.query(weekSql, params)).rows;

  res.render('pages/secretaire/agenda', {
    title: 'Agenda Secrétariat',
    doc,
    stats,
    todayAppts,
    weekAppts,
    filterStatut,
    creneaux: CRENEAUX,
    today: t
  });
}));

// ============================================================
// 2. Prise de rendez-vous pour un patient existant
// ============================================================
router.get('/secretaire/nouveau-rdv', onlySecretaire, wrap(async (req, res) => {
  const doc = await getAssignedDoctor(req.user.medecin_id);
  if (!doc) {
    return renderError(res, 400, 'Médecin non assigné', 'Votre compte n\'est rattaché à aucun médecin.');
  }

  const q = String(req.query.q || '').trim();
  let patients = [];
  if (q) {
    // Recherche sécurisée paramétrée par nom ou email
    const { rows } = await db.query(
      "SELECT id, nom, email FROM users WHERE role = 'patient' AND (nom ILIKE $1 OR email ILIKE $1) ORDER BY nom LIMIT 15",
      ['%' + q + '%']
    );
    patients = rows;
  }

  const days = bookableDays(await bookedSet(doc.id));

  res.render('pages/secretaire/nouveau-rdv', {
    title: 'Nouveau Rendez-vous',
    doc,
    days,
    patients,
    q,
    creneaux: CRENEAUX
  });
}));

router.post('/secretaire/rendez-vous', onlySecretaire, wrap(async (req, res) => {
  const doc = await getAssignedDoctor(req.user.medecin_id);
  if (!doc) return renderError(res, 400, 'Erreur', 'Médecin non assigné.');

  const patientId = parseInt(req.body.patient_id, 10);
  const { date, heure, type } = req.body;
  const motif = String(req.body.motif || '').trim();

  if (!patientId || !date || !heure || !['en_ligne', 'cabinet'].includes(type) || motif.length < 3) {
    return redirectWithToast(res, '/secretaire/nouveau-rdv', 'Veuillez remplir correctement tous les champs.', 'error');
  }

  // Vérifier existence du patient
  const patientCheck = await db.query("SELECT id, nom FROM users WHERE id = $1 AND role = 'patient'", [patientId]);
  if (!patientCheck.rowCount) {
    return redirectWithToast(res, '/secretaire/nouveau-rdv', 'Patient introuvable.', 'error');
  }

  try {
    await db.query(
      "INSERT INTO appointments (patient_id, medecin_id, date, heure, motif, type, statut) VALUES ($1, $2, $3, $4, $5, $6, 'confirme')",
      [patientId, doc.id, date, heure, motif, type]
    );
  } catch (e) {
    if (e.code === '23505') {
      return redirectWithToast(res, '/secretaire/nouveau-rdv', 'Ce créneau est déjà réservé.', 'error');
    }
    throw e;
  }

  redirectWithToast(res, '/secretaire', `Rendez-vous planifié avec succès pour ${patientCheck.rows[0].nom}.`);
}));

// ============================================================
// 3. Modifier le statut d'un rendez-vous (Confirmer / Annuler / Terminer)
// ============================================================
router.post('/secretaire/rendez-vous/:id/statut', onlySecretaire, wrap(async (req, res) => {
  const apptId = parseInt(req.params.id, 10);
  const statut = String(req.body.statut || '').trim();

  if (!['confirme', 'termine', 'annule'].includes(statut)) {
    return redirectWithToast(res, '/secretaire', 'Statut invalide.', 'error');
  }

  // Contrôle d'accès strict : la secrétaire ne peut modifier QUE les rendez-vous de son médecin assigné
  const result = await db.query(
    'UPDATE appointments SET statut = $1 WHERE id = $2 AND medecin_id = $3 RETURNING id',
    [statut, apptId, req.user.medecin_id]
  );

  if (!result.rowCount) {
    return renderError(res, 403, 'Action non autorisée', 'Ce rendez-vous n\'appartient pas à votre médecin ou n\'existe pas.');
  }

  redirectWithToast(res, '/secretaire', `Statut du rendez-vous mis à jour (${statut}).`);
}));

// ============================================================
// 4. Reprogrammer un rendez-vous (date et heure)
// ============================================================
router.post('/secretaire/rendez-vous/:id/reprogrammer', onlySecretaire, wrap(async (req, res) => {
  const apptId = parseInt(req.params.id, 10);
  const { date, heure } = req.body;

  if (!date || !heure || !CRENEAUX.includes(heure)) {
    return redirectWithToast(res, '/secretaire', 'Date ou créneau horaire invalide.', 'error');
  }

  // Contrôle d'accès strict
  const check = await db.query(
    'SELECT id FROM appointments WHERE id = $1 AND medecin_id = $2',
    [apptId, req.user.medecin_id]
  );
  if (!check.rowCount) {
    return renderError(res, 403, 'Action non autorisée', 'Ce rendez-vous n\'appartient pas à votre médecin.');
  }

  try {
    await db.query(
      'UPDATE appointments SET date = $1, heure = $2 WHERE id = $3 AND medecin_id = $4',
      [date, heure, apptId, req.user.medecin_id]
    );
  } catch (e) {
    if (e.code === '23505') {
      return redirectWithToast(res, '/secretaire', 'Ce créneau est déjà occupé pour ce médecin.', 'error');
    }
    throw e;
  }

  redirectWithToast(res, '/secretaire', 'Rendez-vous reprogrammé avec succès.');
}));

module.exports = router;
