# Correctif VULN-03 - /debug (src/app.js)
Supprimer entièrement la route `app.get('/debug', ...)`.
Si un diagnostic est indispensable : n'exposer que `{ node: process.version }`, derrière une authentification, et jamais `process.env`.
Puis changer `JWT_SECRET` et le mot de passe de la base (ils ont pu fuiter).
