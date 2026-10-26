// Authentification par JWT stocké dans un cookie httpOnly
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { renderError } = require('../utils');

/** Lit le cookie, vérifie le JWT et expose l'utilisateur aux routes et aux vues. */
function loadUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  res.locals.currentPath = req.path;
  res.locals.toast = req.query.toast
    ? { msg: String(req.query.toast).slice(0, 140), type: req.query.type === 'error' ? 'error' : 'success' }
    : null;
  const token = req.cookies && req.cookies.token;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      res.locals.user = req.user;
    } catch (e) {
      res.clearCookie('token'); // jeton invalide ou expiré
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

function requireRole(role) {
  const allowed = Array.isArray(role) ? role : [role];
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!allowed.includes(req.user.role)) return renderError(res, 403, 'Accès refusé', "Cette page n'est pas accessible avec votre rôle.");
    next();
  };
}

module.exports = { loadUser, requireAuth, requireRole };
