// Écrans patient : accueil, médecins, réservation, rendez-vous, dossier
const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { notifyBooking } = require('../notify');
const { SPECIALITES, FRAIS_PLATEFORME, today, bookableDays, wrap, redirectWithToast, renderError } = require('../utils');

const router = express.Router();
const only = requireRole('patient');

async function getMedecin(rawId) {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id)) return null;
  const { rows } = await db.query("SELECT id, nom, specialite, note, tarif FROM users WHERE id = $1 AND role = 'medecin'", [id]);
  return rows[0] || null;
}

/** Créneaux déjà pris pour un médecin, sous forme "AAAA-MM-JJ|HH:MM". */
async function bookedSet(medecinId) {
  const { rows } = await db.query("SELECT date, heure FROM appointments WHERE medecin_id = $1 AND statut <> 'annule' AND date >= $2", [medecinId, today()]);
  return new Set(rows.map((r) => r.date + '|' + r.heure));
}

router.get('/accueil', only, wrap(async (req, res) => {
  const { rows } = await db.query("SELECT id, nom, specialite, note, tarif FROM users WHERE role = 'medecin' ORDER BY note DESC, nom LIMIT 4");
  res.render('pages/patient-home', { title: 'Accueil', best: rows });
}));

router.get('/medecins', only, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const specialite = String(req.query.specialite || '');
  const params = [];
  let sql = "SELECT id, nom, specialite, note, tarif FROM users WHERE role = 'medecin'";
  if (q) {
    params.push('%' + q + '%');
    sql += ` AND (nom ILIKE $${params.length} OR specialite ILIKE $${params.length})`;
  }
  if (SPECIALITES.some((s) => s.nom === specialite)) {
    params.push(specialite);
    sql += ` AND specialite = $${params.length}`;
  }
  sql += ' ORDER BY note DESC, nom';
  const { rows } = await db.query(sql, params);
  res.render('pages/doctors', { title: 'Médecins', doctors: rows, q, specialite });
}));

router.get('/medecins/:id/reserver', only, wrap(async (req, res) => {
  const doc = await getMedecin(req.params.id);
  if (!doc) return renderError(res, 404, 'Médecin introuvable', "Ce médecin n'existe pas.");
  const days = bookableDays(await bookedSet(doc.id));
  res.render('pages/book', { title: 'Prendre rendez-vous', doc, days, frais: FRAIS_PLATEFORME, total: Number(doc.tarif) + FRAIS_PLATEFORME });
}));

router.post('/rendez-vous', only, wrap(async (req, res) => {
  const doc = await getMedecin(req.body.medecin_id);
  if (!doc) return renderError(res, 404, 'Médecin introuvable', "Ce médecin n'existe pas.");
  const back = `/medecins/${doc.id}/reserver`;
  const { date, heure, type } = req.body;
  const motif = String(req.body.motif || '').trim();

  const day = bookableDays(await bookedSet(doc.id)).find((d) => d.iso === date);
  const slot = day && day.slots.find((s) => s.heure === heure);
  if (!slot || !slot.dispo || !['en_ligne', 'cabinet'].includes(type) || motif.length < 3 || motif.length > 200) {
    return redirectWithToast(res, back, 'Veuillez vérifier les informations du rendez-vous.', 'error');
  }
  try {
    await db.query(
      "INSERT INTO appointments (patient_id, medecin_id, date, heure, motif, type, statut) VALUES ($1, $2, $3, $4, $5, $6, 'confirme')",
      [req.user.id, doc.id, date, heure, motif, type]
    );
  } catch (e) {
    if (e.code === '23505') return redirectWithToast(res, back, "Ce créneau vient d'être réservé par quelqu'un d'autre.", 'error');
    throw e;
  }
  notifyBooking(req.user.nom, doc.nom, date, heure);
  redirectWithToast(res, '/rendez-vous', 'Rendez-vous réservé avec succès !');
}));

router.get('/rendez-vous', only, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*, u.nom AS medecin_nom, u.specialite
       FROM appointments a JOIN users u ON u.id = a.medecin_id
      WHERE a.patient_id = $1 ORDER BY a.date, a.heure`,
    [req.user.id]
  );
  const t = today();
  const lists = { avenir: [], passes: [], annules: [] };
  rows.forEach((a) => {
    if (a.statut === 'annule') { a.etat = 'annule'; lists.annules.push(a); }
    else if (a.date >= t && a.statut === 'confirme') { a.etat = 'confirme'; lists.avenir.push(a); }
    else { a.etat = 'termine'; lists.passes.push(a); }
  });
  lists.passes.reverse(); // les plus récents d'abord
  const tab = lists[req.query.tab] ? req.query.tab : 'avenir';
  const counts = { avenir: lists.avenir.length, passes: lists.passes.length, annules: lists.annules.length };
  res.render('pages/appointments', { title: 'Mes rendez-vous', tab, items: lists[tab], counts });
}));

router.post('/rendez-vous/:id/annuler', only, wrap(async (req, res) => {
  const r = await db.query(
    "UPDATE appointments SET statut = 'annule' WHERE id = $1 AND patient_id = $2 AND statut = 'confirme'",
    [parseInt(req.params.id, 10) || 0, req.user.id]
  );
  if (!r.rowCount) return redirectWithToast(res, '/rendez-vous', "Impossible d'annuler ce rendez-vous.", 'error');
  redirectWithToast(res, '/rendez-vous?tab=annules', 'Rendez-vous annulé.');
}));

router.get('/dossier', only, wrap(async (req, res) => {
  // Récupération des informations patient
  const patient = (await db.query(
    `SELECT u.id, u.nom, u.email, u.date_naissance, u.created_at,
            m.id AS medecin_id, m.nom AS medecin_nom, m.specialite AS medecin_specialite
       FROM users u
       LEFT JOIN users m ON m.id = u.medecin_traitant_id
      WHERE u.id = $1`,
    [req.user.id]
  )).rows[0];

  // 1. Actes et antécédents médicaux (dossier médical général)
  const { rows: records } = await db.query(
    'SELECT id, diagnostic, notes, created_at FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC, id DESC',
    [req.user.id]
  );

  // 2. Historique des ordonnances indépendantes
  const { rows: ordonnances } = await db.query(
    `SELECT o.id, o.diagnostic_associe, o.date_creation, m.nom AS medecin_nom, m.specialite AS medecin_specialite
       FROM ordonnances o
       JOIN users m ON m.id = o.medecin_id
      WHERE o.patient_id = $1
      ORDER BY o.date_creation DESC`,
    [req.user.id]
  );

  res.render('pages/records', {
    title: 'Mon dossier médical',
    patient,
    records,
    ordonnances
  });
}));

module.exports = router;
