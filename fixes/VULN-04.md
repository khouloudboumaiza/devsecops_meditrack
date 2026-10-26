# Correctif VULN-04 - secret en dur (src/config.js)
```js
const API_KEY = process.env.API_KEY; // défini dans .env (jamais commité) ou dans un gestionnaire de secrets
if (!API_KEY && process.env.NODE_ENV === 'production') throw new Error('API_KEY manquante');
module.exports = { API_KEY, JWT_SECRET };
```
Adapter `src/notify.js` (`API_KEY` au lieu de `FAKE_API_KEY`), ajouter `API_KEY=` dans `.env.example`, révoquer l'ancienne clé et nettoyer l'historique Git si besoin.
