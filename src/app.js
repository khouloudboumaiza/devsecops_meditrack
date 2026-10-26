// Point d'entrée de MediTrack (version VOLONTAIREMENT VULNERABLE - usage pédagogique)
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const client = require('prom-client');
const { loadUser } = require('./middleware/auth');
const { viewHelpers, renderError } = require('./utils');

const app = express();

// --- Moteur de vues EJS + layouts ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main'); // layout par défaut (application connectée)
Object.assign(app.locals, viewHelpers); // fonctions disponibles dans toutes les vues

// --- Métriques Prometheus ---
client.collectDefaultMetrics();
const httpCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre de requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
});
app.use((req, res, next) => {
  res.on('finish', () => {
    const route = req.route ? req.route.path : 'non_route';
    httpCounter.inc({ method: req.method, route, status: res.statusCode });
  });
  next();
});

// --- Middlewares ---
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(loadUser);

// --- Endpoints techniques ---
app.get('/health', (req, res) => res.type('text').send('ok'));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// VULN-03 : endpoint de debug laissé en production, sans authentification : expose variables d'environnement et stack trace
app.get('/debug', (req, res) => {
  res.json({
    node: process.version,
    env: process.env,
    stack: new Error('trace de debug').stack,
  });
});

// --- Routes applicatives ---
app.use(require('./routes/auth'));
app.use(require('./routes/patient'));
app.use(require('./routes/medecin'));
app.use(require('./routes/secretaire'));
app.use(require('./routes/admin'));
app.use(require('./routes/records'));
app.use(require('./routes/ordonnances'));

// --- Erreurs ---
app.use((req, res) => renderError(res, 404, 'Page introuvable', "La page que vous cherchez n'existe pas ou a été déplacée."));
app.use((err, req, res, next) => {
  console.error(err);
  renderError(res, 500, 'Une erreur est survenue', 'Un problème technique est survenu. Veuillez réessayer dans un instant.');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`MediTrack (version vulnérable) : http://localhost:${port}`));
