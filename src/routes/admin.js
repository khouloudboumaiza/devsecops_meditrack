// Espace Administrateur : statistiques globales, supervision des utilisateurs et création de comptes
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { SPECIALITES, wrap, redirectWithToast, renderError } = require('../utils');

const router = express.Router();
const onlyAdmin = requireRole('admin');

// ============================================================
// 1. Dashboard Administrateur (vue d'ensemble style "Hospital App")
// ============================================================
router.get('/admin', onlyAdmin, wrap(async (req, res) => {
  // 4 KPI principaux
  const kpiQuery = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'patient') AS total_patients,
      (SELECT COUNT(*) FROM users WHERE role = 'medecin') AS total_medecins,
      (SELECT COUNT(*) FROM users WHERE role = 'secretaire') AS total_secretaires,
      (SELECT COUNT(*) FROM appointments) AS total_rdv,
      (SELECT COUNT(*) FROM appointments WHERE statut = 'confirme') AS rdv_confirmes,
      (SELECT COUNT(*) FROM appointments WHERE statut = 'termine') AS rdv_termines
  `);
  const kpi = kpiQuery.rows[0];

  // Médecin le plus sollicité (Best Doctor card)
  const topDoctorQuery = await db.query(`
    SELECT u.id, u.nom, u.specialite, u.note, u.tarif, COUNT(a.id) AS total_rdv
      FROM users u
      LEFT JOIN appointments a ON a.medecin_id = u.id
     WHERE u.role = 'medecin'
     GROUP BY u.id, u.nom, u.specialite, u.note, u.tarif
     ORDER BY total_rdv DESC, u.note DESC
     LIMIT 1
  `);
  const topDoctor = topDoctorQuery.rows[0] || null;

  // Derniers rendez-vous enregistrés dans toute la clinique
  const recentAppts = (await db.query(`
    SELECT a.*, p.nom AS patient_nom, m.nom AS medecin_nom, m.specialite
      FROM appointments a
      JOIN users p ON p.id = a.patient_id
      JOIN users m ON m.id = a.medecin_id
     ORDER BY a.date DESC, a.heure DESC
     LIMIT 7
  `)).rows;

  // Liste des médecins pour formulaires
  const doctorsList = (await db.query(
    "SELECT id, nom, specialite FROM users WHERE role = 'medecin' ORDER BY nom"
  )).rows;

  res.render('pages/admin/dashboard', {
    title: 'Tableau de bord Administrateur',
    kpi,
    topDoctor,
    recentAppts,
    doctorsList
  });
}));

// ============================================================
// 2. Gestion des utilisateurs (filtrable, activation / désactivation)
// ============================================================
router.get('/admin/utilisateurs', onlyAdmin, wrap(async (req, res) => {
  const filterRole = String(req.query.role || 'tous').trim();
  const q = String(req.query.q || '').trim();

  let sql = `
    SELECT u.id, u.nom, u.email, u.role, u.specialite, u.actif, m.nom AS medecin_nom
      FROM users u
      LEFT JOIN users m ON m.id = u.medecin_id
     WHERE 1=1
  `;
  const params = [];

  if (filterRole !== 'tous' && ['patient', 'medecin', 'secretaire', 'admin'].includes(filterRole)) {
    params.push(filterRole);
    sql += ` AND u.role = $${params.length}`;
  }

  if (q) {
    params.push('%' + q + '%');
    sql += ` AND (u.nom ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
  }

  sql += ' ORDER BY u.role, u.nom';
  const users = (await db.query(sql, params)).rows;

  // Liste des médecins pour le formulaire d'assignation d'une secrétaire
  const doctorsList = (await db.query(
    "SELECT id, nom, specialite FROM users WHERE role = 'medecin' AND actif = TRUE ORDER BY nom"
  )).rows;

  res.render('pages/admin/utilisateurs', {
    title: 'Gestion des Utilisateurs',
    users,
    filterRole,
    q,
    doctorsList,
    specialites: SPECIALITES
  });
}));

// ============================================================
// 3. Créer un compte Médecin
// ============================================================
router.post('/admin/users/medecin', onlyAdmin, wrap(async (req, res) => {
  const nom        = String(req.body.nom || '').trim();
  const email      = String(req.body.email || '').trim().toLowerCase();
  const password   = String(req.body.password || '');
  const specialite = String(req.body.specialite || '').trim();
  const tarif      = parseFloat(req.body.tarif) || 40.0;

  if (nom.length < 2 || !email || password.length < 8 || !specialite) {
    return redirectWithToast(res, '/admin/utilisateurs', 'Veuillez vérifier les informations du médecin (mot de passe min. 8 car.).', 'error');
  }

  const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) {
    return redirectWithToast(res, '/admin/utilisateurs', 'Un compte existe déjà avec cet e-mail.', 'error');
  }

  const hash = await bcrypt.hash(password, 10);
  await db.query(
    "INSERT INTO users (nom, email, mot_de_passe_hash, role, specialite, note, tarif, actif) VALUES ($1, $2, $3, 'medecin', $4, 4.5, $5, TRUE)",
    [nom, email, hash, specialite, tarif]
  );

  redirectWithToast(res, '/admin/utilisateurs?role=medecin', `Médecin ${nom} créé avec succès.`);
}));

// ============================================================
// 4. Créer un compte Secrétaire rattaché à un médecin
// ============================================================
router.post('/admin/users/secretaire', onlyAdmin, wrap(async (req, res) => {
  const nom       = String(req.body.nom || '').trim();
  const email     = String(req.body.email || '').trim().toLowerCase();
  const password  = String(req.body.password || '');
  const medecinId = parseInt(req.body.medecin_id, 10);

  if (nom.length < 2 || !email || password.length < 8 || !medecinId) {
    return redirectWithToast(res, '/admin/utilisateurs', 'Veuillez renseigner tous les champs et sélectionner un médecin.', 'error');
  }

  // Vérifier existence du médecin
  const docCheck = await db.query("SELECT nom FROM users WHERE id = $1 AND role = 'medecin'", [medecinId]);
  if (!docCheck.rowCount) {
    return redirectWithToast(res, '/admin/utilisateurs', 'Médecin sélectionné introuvable.', 'error');
  }

  const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) {
    return redirectWithToast(res, '/admin/utilisateurs', 'Un compte existe déjà avec cet e-mail.', 'error');
  }

  const hash = await bcrypt.hash(password, 10);
  await db.query(
    "INSERT INTO users (nom, email, mot_de_passe_hash, role, medecin_id, actif) VALUES ($1, $2, $3, 'secretaire', $4, TRUE)",
    [nom, email, hash, medecinId]
  );

  redirectWithToast(res, '/admin/utilisateurs?role=secretaire', `Secrétaire ${nom} rattaché(e) au ${docCheck.rows[0].nom} créé(e) avec succès.`);
}));

// ============================================================
// 5. Activer / Désactiver un compte utilisateur
// ============================================================
router.post('/admin/users/:id/toggle-actif', onlyAdmin, wrap(async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  // Empêcher l'administrateur de se désactiver lui-même
  if (userId === req.user.id) {
    return redirectWithToast(res, '/admin/utilisateurs', 'Vous ne pouvez pas désactiver votre propre compte administrateur.', 'error');
  }

  const userRes = await db.query('SELECT id, nom, actif FROM users WHERE id = $1', [userId]);
  if (!userRes.rowCount) {
    return renderError(res, 404, 'Utilisateur introuvable', "Cet utilisateur n'existe pas.");
  }

  const nextState = !userRes.rows[0].actif;
  await db.query('UPDATE users SET actif = $1 WHERE id = $2', [nextState, userId]);

  const msg = nextState
    ? `Le compte de ${userRes.rows[0].nom} a été activé.`
    : `Le compte de ${userRes.rows[0].nom} a été désactivé.`;
  redirectWithToast(res, '/admin/utilisateurs', msg);
}));

module.exports = router;
