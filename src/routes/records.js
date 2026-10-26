// Détail d'un dossier médical + ajout de note (médecin)
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, redirectWithToast, renderError } = require('../utils');

const router = express.Router();

router.get('/records/:id', requireAuth, wrap(async (req, res) => {
  // Le rôle secrétaire n'a aucun droit d'accès aux dossiers médicaux
  if (req.user.role === 'secretaire') {
    return renderError(res, 403, 'Accès interdit', 'Les secrétaires ne sont pas autorisées à consulter les dossiers médicaux.');
  }

  const id = parseInt(req.params.id, 10) || 0;
  // VULN-02 : IDOR - aucune vérification que le dossier appartient à l'utilisateur connecté (ou à un médecin autorisé)
  const { rows } = await db.query(
    'SELECT r.*, u.nom AS patient_nom FROM medical_records r JOIN users u ON u.id = r.patient_id WHERE r.id = $1', [id]);
  if (!rows[0]) return renderError(res, 404, 'Dossier introuvable', "Ce dossier n'existe pas.");
  res.render('pages/record', { title: 'Dossier médical', r: rows[0] });
}));

router.post('/records/:id/notes', requireRole('medecin'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const texte = String(req.body.note || '').trim();
  if (texte.length < 3 || texte.length > 500) {
    return redirectWithToast(res, `/records/${id}`, 'La note doit contenir entre 3 et 500 caractères.', 'error');
  }
  const ligne = `[${new Date().toISOString().slice(0, 10)}] ${req.user.nom} : ${texte}`;
  const r = await db.query("UPDATE medical_records SET notes = COALESCE(notes || E'\\n', '') || $1 WHERE id = $2", [ligne, id]);
  if (!r.rowCount) return renderError(res, 404, 'Dossier introuvable', "Ce dossier n'existe pas.");
  redirectWithToast(res, `/records/${id}`, 'Note ajoutée au dossier.');
}));

module.exports = router;
