# Correctif VULN-01 - injection SQL (src/routes/medecin.js)
Remplacer la requête concaténée par une requête paramétrée :
```js
const sql = "SELECT id, nom, email FROM users WHERE role = 'patient' AND nom ILIKE $1 ORDER BY nom";
patients = (await db.query(sql, ['%' + q + '%'])).rows;
```
