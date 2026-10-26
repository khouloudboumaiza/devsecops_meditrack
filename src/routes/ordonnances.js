// Route de consultation des ordonnances médicales indépendantes
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { wrap, renderError } = require('../utils');

const router = express.Router();

/**
 * GET /ordonnances/:id
 * Document officiel d'ordonnance au format "Prescription" violet/bleu
 * Contrôle d'accès strict :
 * - Patient : uniquement ses propres ordonnances
 * - Médecin / Admin : consultation autorisée
 * - Secrétaire : accès interdit (403)
 */
router.get('/ordonnances/:id', requireAuth, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;

  if (req.user.role === 'secretaire') {
    return renderError(res, 403, 'Accès interdit', 'Les secrétaires ne sont pas autorisées à consulter les ordonnances médicales.');
  }

  const { rows } = await db.query(
    `SELECT o.*,
            p.nom AS patient_nom, p.date_naissance, p.email AS patient_email,
            m.nom AS medecin_nom, m.specialite AS medecin_specialite, m.email AS medecin_email
       FROM ordonnances o
       JOIN users p ON p.id = o.patient_id
       JOIN users m ON m.id = o.medecin_id
      WHERE o.id = $1`,
    [id]
  );

  const ord = rows[0];
  if (!ord) {
    return renderError(res, 404, 'Ordonnance introuvable', "Cette ordonnance n'existe pas ou a été déplacée.");
  }

  // Contrôle d'accès sécurisé pour le patient (pas d'IDOR sur les ordonnances)
  if (req.user.role === 'patient' && ord.patient_id !== req.user.id) {
    return renderError(res, 403, 'Accès refusé', 'Vous ne pouvez consulter que vos propres ordonnances médicales.');
  }

  res.render('pages/ordonnance', {
    title: `Ordonnance N° ${ord.id} - ${ord.patient_nom}`,
    ord
  });
}));

module.exports = router;
