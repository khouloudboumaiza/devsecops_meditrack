# Correctif VULN-05 - dépendance vulnérable (package.json)
```bash
npm install ejs@latest
npm audit
```
Dans package.json : remplacer `"ejs": "3.1.6"` par une plage à jour (ex. `"^3.1.10"`) et supprimer la clé `"//"`.
Ajouter Dependabot ou Renovate pour être alerté automatiquement.
