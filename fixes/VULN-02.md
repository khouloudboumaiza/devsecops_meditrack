# Correctif VULN-02 - IDOR (src/routes/records.js, route GET /records/:id)
Après la lecture du dossier :
```js
const rec = rows[0];
if (!rec) return renderError(res, 404, 'Dossier introuvable', "Ce dossier n'existe pas.");
const isOwner = req.user.role === 'patient' && rec.patient_id === req.user.id;
let isTreating = false;
if (req.user.role === 'medecin') {
  const rel = await db.query('SELECT 1 FROM appointments WHERE medecin_id = $1 AND patient_id = $2 LIMIT 1', [req.user.id, rec.patient_id]);
  isTreating = rel.rowCount > 0;
}
if (!isOwner && !isTreating) return renderError(res, 403, 'Accès refusé', "Vous n'avez pas accès à ce dossier.");
```
Appliquer la même vérification à `POST /records/:id/notes` et à `/medecin/patients/:id`.
