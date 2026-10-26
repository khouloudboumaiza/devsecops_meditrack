# Fiches de vulnérabilités - MediTrack (branche `vulnerable`)

> **Cadre pédagogique.** Ces failles sont volontaires. Toutes les démonstrations visent **uniquement l'application locale** (`http://localhost:3000`) avec des données fictives. Ne jamais les reproduire sur un système qui ne vous appartient pas.

| ID | Faille | Catégorie OWASP Top 10 (2021) | Fichier |
|----|--------|-------------------------------|---------|
| VULN-01 | Injection SQL | A03 - Injection | `src/routes/medecin.js:30` |
| VULN-02 | IDOR | A01 - Broken Access Control | `src/routes/records.js:11` |
| VULN-03 | Endpoint `/debug` exposé | A05 - Security Misconfiguration | `src/app.js:49` |
| VULN-04 | Secret en dur | A02 - Cryptographic Failures (CWE-798)* | `src/config.js:3` |
| VULN-05 | Dépendance vulnérable (ejs 3.1.6) | A06 - Vulnerable and Outdated Components | `package.json:17` |
| VULN-06 | XSS stocké (optionnelle) | A03 - Injection | `src/views/pages/record.ejs:13` |

\* Le classement exact d'un secret codé en dur varie selon les référentiels (A02 ou A07). À valider avec votre encadrant.

Les numéros de ligne correspondent à la version livrée ; ils peuvent bouger si vous modifiez le code. Cherchez `VULN-` dans le dépôt.

---

## VULN-01 - Injection SQL (recherche de patients)
- **Où :** `src/routes/medecin.js:30` (route médecin `GET /medecin/patients?q=`).
- **Cause :** la saisie `q` est concaténée dans la chaîne SQL au lieu d'utiliser une requête paramétrée.
- **Impact :** lecture de toute la base (dont les hachages de mots de passe), contournement du filtre, éventuellement modification de données.
- **Démonstration (en local) :**
  1. Connectez-vous avec `medecin1@meditrack.test` / `Password123!`.
  2. Ouvrez *Patients* et saisissez : `x' OR '1'='1' --`
  3. Puis : `x' UNION SELECT id, mot_de_passe_hash, email FROM users --`
- **Preuve attendue :** la 1re saisie renvoie tous les patients malgré un nom incohérent ; la 2e affiche, à la place des noms, des chaînes commençant par `$2b$10$` (hachages bcrypt) et les e-mails des médecins.
- **Correction (`fixes/VULN-01.md`) :** `db.query("... AND nom ILIKE $1 ORDER BY nom", ['%' + q + '%'])`. Compléments : compte BDD à privilèges minimaux, validation de la longueur.

## VULN-02 - IDOR sur `GET /records/:id`
- **Où :** `src/routes/records.js:11`.
- **Cause :** la route vérifie seulement que l'utilisateur est connecté, pas que le dossier lui appartient.
- **Impact :** n'importe quel patient connecté lit les dossiers (diagnostics, ordonnances, notes) des autres en changeant l'identifiant.
- **Démonstration :**
  1. Connectez-vous avec `patient1@meditrack.test`, ouvrez *Dossier* puis un détail (ex. `/records/1`).
  2. Dans la barre d'adresse, remplacez l'identifiant par `/records/3`, `/records/7`…
- **Preuve attendue :** réponse 200 avec le nom et les données d'un autre patient. Après correction : 403/404.
- **Correction (`fixes/VULN-02.md`) :** autoriser seulement le propriétaire (`r.patient_id === req.user.id`) ou un médecin ayant un rendez-vous avec ce patient ; journaliser les refus.

## VULN-03 - Mauvaise configuration : `/debug`
- **Où :** `src/app.js:49`.
- **Cause :** un endpoint de diagnostic reste accessible sans authentification et renvoie `process.env` et une stack trace.
- **Impact :** fuite de `DATABASE_URL`, `JWT_SECRET`, chemins serveur ; un attaquant pourrait forger des JWT (rôle `medecin`).
- **Démonstration :** `curl http://localhost:3000/debug` (ou navigateur).
- **Preuve attendue :** JSON contenant `env.DATABASE_URL` et `env.JWT_SECRET`.
- **Correction (`fixes/VULN-03.md`) :** supprimer la route (ou l'exposer seulement hors production et derrière une authentification), changer les secrets compromis.

## VULN-04 - Secret exposé dans le code
- **Où :** `src/config.js:3` (utilisé dans `src/notify.js`).
- **Cause :** la clé factice `FAKE_API_KEY_DO_NOT_USE_123456` est écrite en dur et versionnée dans Git.
- **Impact :** toute personne ayant accès au dépôt (ou à son historique) obtient la clé ; la supprimer plus tard du code ne l'efface pas de l'historique.
- **Démonstration :** `grep -rn "FAKE_API_KEY" src/`. Un scanner de secrets (gitleaks, trufflehog) permet de la détecter automatiquement en CI.
- **Preuve attendue :** la clé apparaît dans le résultat de la recherche / du scanner.
- **Correction (`fixes/VULN-04.md`) :** lire la clé via `process.env.API_KEY`, la stocker dans un gestionnaire de secrets, la **révoquer et la remplacer** si elle était réelle.

## VULN-05 - Dépendance vulnérable : `ejs@3.1.6`
- **Où :** `package.json:17` (version volontairement épinglée).
- **Cause :** EJS 3.1.6 est touché par la **CVE-2022-29078** (injection de code côté serveur via l'option interne `outputFunctionName`, corrigée dans EJS 3.1.7). D'autres CVE plus récentes existent sur les anciennes versions 3.1.x : `npm audit` donne la liste à jour.
- **Impact :** potentiellement exécution de code à distance **si** l'application passe des données contrôlées par l'utilisateur (ex. `req.query`) directement comme options de `res.render`. **Ce n'est pas le cas dans MediTrack** : la faille est présente mais non exploitable en l'état. C'est un bon exemple pour expliquer la notion d'*atteignabilité* en analyse de composition logicielle (SCA).
- **Démonstration :** `npm install` puis `npm audit` (ou plus tard Trivy / Dependabot en CI). Je n'ai pas pu exécuter `npm audit` ici (pas de réseau) : vérifiez le résultat chez vous.
- **Preuve attendue :** `npm audit` signale `ejs` avec la gravité et l'identifiant de l'avis (GHSA / CVE-2022-29078).
- **Correction (`fixes/VULN-05.md`) :** `npm install ejs@latest` (3.1.x récent), puis `npm audit` pour contrôle ; activer Dependabot/Renovate.

## VULN-06 - XSS stocké dans les notes (optionnelle)
- **Où :** `src/views/pages/record.ejs:13` (`pages/record.ejs`, affichage), écriture via `POST /records/:id/notes`.
- **Cause :** les notes sont affichées avec `<%- %>` (HTML non échappé) au lieu de `<%= %>`.
- **Impact :** exécution de JavaScript dans le navigateur du patient ou d'un autre médecin ouvrant le dossier (vol de données affichées, actions à sa place).
- **Démonstration :**
  1. Connecté en médecin, ouvrez un dossier (*Patients* → patient → *Ouvrir*), ajoutez la note : `<img src=x onerror=alert('XSS-demo')>`
  2. Connectez-vous en patient (propriétaire du dossier) et ouvrez ce dossier.
- **Preuve attendue :** une boîte `alert('XSS-demo')` s'affiche. (Le cookie JWT étant `httpOnly`, il n'est pas lisible par ce script ; l'impact se limite ici à ce qui est accessible dans la page.)
- **Correction (`fixes/VULN-06.md`) :** `<%= line %>` (échappement) + une politique CSP stricte (`script-src 'self'`, ce qui est possible car l'application n'a ni script ni style inline).
