// Inscription, connexion, déconnexion, profil – routes + API JSON pour le popup
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { JWT_SECRET } = require('../config');
const { requireAuth } = require('../middleware/auth');
const { wrap, redirectWithToast } = require('../utils');

const router = express.Router();
const PUBLIC = { layout: 'layouts/public' };

/** Redirection post-connexion selon le rôle de l'utilisateur. */
const homeFor = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'secretaire') return '/secretaire';
  if (role === 'medecin') return '/medecin';
  return '/accueil';
};

/** Crée le JWT et le dépose dans un cookie httpOnly (2 h). */
function startSession(res, u) {
  const token = jwt.sign(
    { id: u.id, nom: u.nom, role: u.role, medecin_id: u.medecin_id || null },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
  });
}

// ============================================================
// PAGES HTML (redirigent vers le dashboard si déjà connecté)
// ============================================================

/** Page d'accueil publique – affiche la landing avec le popup auth. */
router.get('/', wrap(async (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user.role));
  const { rows } = await db.query(
    "SELECT id, nom, specialite, note, tarif FROM users WHERE role = 'medecin' ORDER BY note DESC, nom LIMIT 3"
  );
  res.render('pages/home', { ...PUBLIC, title: 'Bienvenue', best: rows });
}));

/** /login redirige vers / ou dashboard selon l'état de connexion. */
router.get('/login', (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user.role));
  res.redirect('/');
});

/** /register redirige vers / ou dashboard selon l'état de connexion. */
router.get('/register', (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user.role));
  res.redirect('/');
});

// ============================================================
// API JSON pour le popup (fetch depuis auth-modal.js)
// ============================================================

/**
 * POST /api/auth/login
 * Body JSON : { email, password }
 * Réponse 200 : { ok: true, role }
 * Réponse 401 : { error: "..." }
 * Réponse 403 : { error: "Compte désactivé" }
 */
router.post('/api/auth/login', express.json(), wrap(async (req, res) => {
  const email    = String(req.body.email    || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail et mot de passe requis.' });
  }

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const u = rows[0];
  const ok = u && (await bcrypt.compare(password, u.mot_de_passe_hash));

  if (!ok) {
    console.log(JSON.stringify({ event: 'login_failed', email, ts: new Date().toISOString() }));
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  }

  if (u.actif === false) {
    console.log(JSON.stringify({ event: 'login_disabled_account', userId: u.id, ts: new Date().toISOString() }));
    return res.status(403).json({ error: 'Ce compte a été désactivé par un administrateur.' });
  }

  startSession(res, u);
  console.log(JSON.stringify({ event: 'login_success', userId: u.id, role: u.role, ts: new Date().toISOString() }));
  return res.json({ ok: true, role: u.role });
}));

/**
 * POST /api/auth/register
 * Body JSON : { nom, email, password, confirm, role? }
 * Réponse 201 : { ok: true, role }
 * Réponse 400 : { errors: [...] }
 */
router.post('/api/auth/register', express.json(), wrap(async (req, res) => {
  const nom      = String(req.body.nom      || '').trim();
  const email    = String(req.body.email    || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const confirm  = String(req.body.confirm  || '');
  const errors   = [];

  if (nom.length < 2 || nom.length > 100) errors.push('Le nom doit contenir entre 2 et 100 caractères.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))   errors.push("L'adresse e-mail n'est pas valide.");
  if (password.length < 8) errors.push('Le mot de passe doit contenir au moins 8 caractères.');
  if (password !== confirm) errors.push('Les mots de passe ne correspondent pas.');

  if (!errors.length) {
    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rowCount) errors.push('Un compte existe déjà avec cet e-mail.');
  }

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const hash = await bcrypt.hash(password, 10);

  // VULN-07 : Élévation de privilèges (Mass Assignment) - le paramètre role envoyé dans la requête
  // est pris en compte sans forcer strictement le rôle 'patient'.
  // Un attaquant peut ainsi créer directement un compte 'admin' ou 'medecin' via l'API d'inscription.
  const requestedRole = String(req.body.role || 'patient').trim();
  const role = ['patient', 'medecin', 'secretaire', 'admin'].includes(requestedRole) ? requestedRole : 'patient';

  const { rows } = await db.query(
    'INSERT INTO users (nom, email, mot_de_passe_hash, role, actif) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, nom, role, medecin_id',
    [nom, email, hash, role]
  );

  startSession(res, rows[0]);
  console.log(JSON.stringify({ event: 'register_success', userId: rows[0].id, role: rows[0].role, ts: new Date().toISOString() }));
  return res.status(201).json({ ok: true, role: rows[0].role });
}));

// ============================================================
// Déconnexion & Profil
// ============================================================

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

router.get('/profil', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.nom, u.email, u.role, u.specialite, u.actif, m.nom AS medecin_nom
       FROM users u
       LEFT JOIN users m ON m.id = u.medecin_id
      WHERE u.id = $1`,
    [req.user.id]
  );
  res.render('pages/profile', { title: 'Profil', me: rows[0] });
}));

module.exports = router;
