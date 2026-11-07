# Pipeline CI/CD et sécurité statique — MediTrack

**Personne 2 :** Pipeline CI/CD + SAST / SCA / Secrets

## Objectif

Automatiser la construction, les tests et l'analyse de sécurité de MediTrack à
chaque `git push`, et **empêcher le déploiement** d'une version qui contient un
secret ou une vulnérabilité critique (*shift-left security* : les failles sont
détectées dès le commit, pas en production).

## Fichiers livrés

| Fichier | Rôle |
|---|---|
| `.gitlab-ci.yml` | Pipeline GitLab CI/CD : build → test → scan → deploy |
| `.github/workflows/devsecops.yml` | Même pipeline pour GitHub Actions (le dépôt de l'équipe est sur GitHub) |
| `.semgrep/meditrack-rules.yml` | Règles SAST Semgrep propres au projet (VULN-01, VULN-06) |
| `.gitleaks.toml` | Configuration Gitleaks : règles par défaut + règles projet (VULN-04) |
| `scripts/scan-local.sh` | Lance tous les scans en local avec Docker (mêmes versions que la CI) |

## Architecture du pipeline

```
 build                 test               scan                                  deploy
 ─────                 ────               ────                                  ──────
 build-image ───────┐  smoke-test         secrets-gitleaks   (secrets)          deploy-image
 (docker build,     │  (npm ci,           sast-semgrep       (SAST)             (tag :latest +
  vérif non-root,   │   node --check,     sca-npm-audit      (SCA)               push registry)
  push registry)    │   /health,          sca-trivy-fs       (SCA)              ▲
                    │   /metrics)         scan-trivy-image   (image Docker)     │ uniquement si
                    └───────────────────────────► ▲                             │ TOUT est vert
                                                                                │ et branche main
```

- **build** : construit l'image avec le `Dockerfile` de la Personne 1, vérifie
  qu'elle ne tourne pas en `root`, puis la pousse dans le GitLab Container
  Registry avec le tag du commit (`$CI_COMMIT_SHORT_SHA`).
- **test** : l'application démarre et répond sur `/health` et `/metrics`.
- **scan** : 5 analyses de sécurité en parallèle (détails ci-dessous).
- **deploy** : publie l'image sous le tag `:latest` — c'est cette image que la
  Personne 3 déploie sur Kubernetes. Le job dépend (`needs`) de **tous** les
  scans : un seul scan bloquant en échec ⇒ pas de déploiement.

## Outils et vulnérabilités ciblées

| Outil | Type | Ce qu'il analyse | Vulnérabilités détectées |
|---|---|---|---|
| **Gitleaks** | Secrets | Tout l'historique Git (`GIT_DEPTH: 0`) | **VULN-04** : `FAKE_API_KEY_DO_NOT_USE_123456` (`src/config.js`), `fake_jwt_secret_for_class_only` (`.env.example`), + mots de passe dans `docker-compose.yml` |
| **Semgrep** | SAST | Code source JS + templates EJS | **VULN-01** : SQLi `src/routes/medecin.js:69` · **VULN-06** : XSS `record.ejs:14`, `doctor-patient.ejs:126` |
| **npm audit** | SCA | `package-lock.json` | **VULN-05** : `ejs` 3.1.6 — CRITICAL (CVE-2022-29078) |
| **Trivy fs** | SCA | Dépendances du projet | **VULN-05** + autres dépendances vulnérables |
| **Trivy image** | Image | Paquets Alpine + `node_modules` de l'image | CVE de l'image de base et des dépendances embarquées |

### Pourquoi des règles personnalisées ?

- **Gitleaks** : avec ses règles par défaut, Gitleaks **ne détecte pas** les
  secrets de MediTrack (testé : `no leaks found`). Ses règles génériques
  cherchent des chaînes à forte entropie ou des formats connus (AWS, GitHub…),
  or `fake_jwt_secret_for_class_only` est une chaîne lisible. Le fichier
  `.gitleaks.toml` garde les règles par défaut (`useDefault = true`) et ajoute
  3 règles : clé d'API en dur, secret JWT en dur, mot de passe dans une URL
  PostgreSQL. Résultat : **7 secrets détectés**.
- **Semgrep** : les règles communautaires (`p/javascript`, `p/expressjs`,
  `p/nodejs`) sont conservées, et deux règles projet garantissent la détection
  de VULN-01 (concaténation dans `db.query`) et VULN-06 (`<%- variable %>`
  dans un template EJS). Les `<%- include(...) %>` légitimes ne sont pas
  signalés (pas de faux positifs).

## Politique de blocage

| Résultat | Décision | Couleur du job | Mise en œuvre |
|---|---|---|---|
| Secret détecté (Gitleaks) | **Bloquant** | 🔴 rouge | `allow_failure: false` |
| Faille SAST de sévérité `ERROR` (Semgrep) | **Bloquant** | 🔴 rouge | `semgrep --severity ERROR --error` |
| Vulnérabilité **CRITICAL** (npm audit / Trivy) | **Bloquant** | 🔴 rouge | `--audit-level=critical` / `trivy --exit-code 1` |
| Vulnérabilité **HIGH** (Trivy) | Avertissement | 🟠 orange | `trivy --exit-code 2` + `allow_failure: exit_codes: [2]` |
| MEDIUM / LOW | Information | 🟢 vert | visibles dans les rapports JSON |

**Justification :**
- Un **secret** commité est compromis dès le push (il reste dans l'historique),
  d'où un blocage systématique, quelle que soit sa « gravité ».
- Une **CRITICAL** est souvent exploitable à distance (ex. VULN-05 : exécution
  de code) : on ne déploie pas.
- Bloquer sur **HIGH** paralyserait l'équipe (beaucoup de HIGH sans correctif
  disponible dans les images de base) : on avertit pour qu'elles soient
  traitées, sans arrêter la livraison.

## Résultat attendu sur la version actuelle

MediTrack étant **volontairement vulnérable**, le pipeline est **rouge** :

| Job | Résultat attendu |
|---|---|
| build-image | ✅ vert |
| smoke-test | ✅ vert |
| secrets-gitleaks | 🔴 7 secrets (VULN-04) |
| sast-semgrep | 🔴 VULN-01 + VULN-06 |
| sca-npm-audit | 🔴 ejs CRITICAL (VULN-05) |
| sca-trivy-fs | 🔴 ejs CRITICAL (VULN-05) |
| scan-trivy-image | 🔴 / 🟠 selon les CVE de l'image |
| deploy-image | ⛔ non exécuté (bloqué) |

C'est le comportement voulu : **le pipeline empêche la mise en production d'une
application vulnérable**. Après application des correctifs (`fixes/VULN-0X.md`),
les jobs repassent au vert et le déploiement est autorisé.

## Sécurité de la chaîne CI elle-même

- **Versions des outils fixées** (`aquasec/trivy:0.69.3`,
  `zricethezav/gitleaks:v8.28.0`, `semgrep/semgrep:1.184.0`), jamais `latest`.
  En mars 2026, l'écosystème Trivy a été compromis (**CVE-2026-33634**) : la
  version 0.69.4 et les tags de `trivy-action` publiaient un malware volant
  les secrets des pipelines. La 0.69.3 est une version déclarée sûre.
- **Pas d'actions tierces** pour les scanners dans le workflow GitHub : les
  outils sont lancés via leur image Docker officielle.
- Identifiants du registre fournis par les variables prédéfinies
  `$CI_REGISTRY_USER` / `$CI_REGISTRY_PASSWORD` (GitLab) ou `GITHUB_TOKEN`
  (GitHub) : **aucun secret écrit dans le pipeline**.
- Les rapports affichent les secrets **masqués** (`--redact`).

## Lancer les scans en local

Prérequis : Docker Desktop démarré. Depuis la racine du projet :

```bash
bash scripts/scan-local.sh              # tous les scans
bash scripts/scan-local.sh gitleaks     # un seul : gitleaks | semgrep | npm | trivy-fs | trivy-image
```

Les rapports JSON sont écrits dans `reports/` (ignoré par Git). Le script
affiche un résumé et indique si le pipeline serait rouge ou vert.

## Utilisation sur GitLab

1. Créer un projet GitLab et y pousser le dépôt (ou *mirror* depuis GitHub).
2. Le pipeline démarre automatiquement à chaque push (**Build → Pipelines**).
3. Rapports : onglet **Jobs → Artifacts** de chaque job, et onglet
   **Security** (rapports `sast` et `container_scanning`).
4. Image publiée : **Deploy → Container Registry**.

## Limites

- L'analyse statique ne voit pas les failles de logique : **VULN-02** (IDOR),
  **VULN-03** (`/debug`) et **VULN-07** (mass assignment) ne sont pas détectées
  par ces outils → c'est le rôle du **DAST (OWASP ZAP, Personne 3)**.
- Les règles personnalisées ciblent les motifs de ce projet ; elles complètent
  mais ne remplacent pas une revue de code.
