# MediTrack (version volontairement vulnérable)

Application web de prise de rendez-vous médicaux et de dossiers patients, créée pour un projet universitaire **DevSecOps**.
⚠️ Elle contient des **failles volontaires** (voir `docs/vulnerabilites.md`). Ne l'exposez jamais sur Internet. Toutes les données sont **fictives**.

**Stack :** Node.js 18+ · Express · PostgreSQL (`pg`) · EJS (layouts/partials) · JWT en cookie + bcrypt · CSS écrit à la main (aucun CDN, aucun script/style inline).

## Prérequis
Node.js ≥ 18, npm, PostgreSQL ≥ 13 (avec `psql`).

## Installation et lancement
```bash
# 1. Dépendances
npm install

# 2. Configuration (valeurs fictives)
cp .env.example .env            # Windows : copy .env.example .env

# 3. Base de données (Linux/macOS ; sous Windows, utilisez le terminal SQL Shell (psql))
sudo -u postgres psql -c "CREATE USER meditrack WITH PASSWORD 'meditrack_pwd';"
sudo -u postgres psql -c "CREATE DATABASE meditrack OWNER meditrack;"
psql "postgresql://meditrack:meditrack_pwd@localhost:5432/meditrack" -f db/schema.sql

# 4. Données de test
npm run seed

# 5. Lancer
npm start                       # ou : npm run dev (rechargement automatique)
```
Ouvrez http://localhost:3000 · Santé : http://localhost:3000/health · Métriques : http://localhost:3000/metrics

## Comptes de test (mot de passe : `Password123!`)
| Rôle | E-mail |
|------|--------|
| Patient (10) | `patient1@meditrack.test` … `patient10@meditrack.test` |
| Médecin (6) | `medecin1@meditrack.test` … `medecin6@meditrack.test` |

Les médecins : 1-2 Généralistes, 3-4 Cardiologues, 5 Dentiste, 6 Neurologue. Vous pouvez aussi créer un compte patient via *Commencer*.

## Fonctionnalités
- **Patient :** inscription, connexion, recherche et filtre des médecins par spécialité, réservation en 3 étapes (date/heure, motif/type, récapitulatif), rendez-vous (à venir / passés / annulés, annulation), dossier médical.
- **Médecin :** tableau de bord (rendez-vous du jour, statistiques), recherche de patients, lecture d'un dossier, ajout de note.
- **Technique :** `GET /health` → `ok` ; `GET /metrics` → format Prometheus (`prom-client`).
- **Design :** violet `#6C4DC4`, mobile-first, barre de navigation inférieure sur mobile et barre latérale sur PC, toasts, états vides, indicateurs de chargement, pages 403/404/500.

## Structure
```
src/        app.js, db.js, config.js, utils.js, routes/, middleware/, views/ (layouts, partials, pages)
public/     css/style.css, js/app.js, icons/ (SVG locaux), fonts/
db/         schema.sql, seed.js
docs/       vulnerabilites.md (une fiche par faille)
fixes/      correctif de chaque faille (pour la branche « fixed »)
```

## Branches Git suggérées
```bash
git init && git add . && git commit -m "MediTrack - version vulnérable"
git branch -M vulnerable
git checkout -b fixed      # appliquez les correctifs de fixes/ puis committez
```

## Failles volontaires (résumé)
VULN-01 injection SQL · VULN-02 IDOR · VULN-03 `/debug` exposé · VULN-04 secret en dur · VULN-05 `ejs@3.1.6` (CVE-2022-29078) · VULN-06 XSS stocké. Détails, démonstrations locales et corrections : `docs/vulnerabilites.md`.

## Captures d'écran
Ajoutez vos captures dans `docs/screenshots/` (accueil, réservation, rendez-vous, tableau de bord médecin) et référencez-les ici.

## Limites connues
- Police : `system-ui` par défaut ; pour héberger Inter localement, voir `public/fonts/README.txt`.
- Les montants (TND) et les notes des médecins sont fictifs.
- Les rendez-vous « en ligne » n'ouvrent pas de vraie visioconférence.
