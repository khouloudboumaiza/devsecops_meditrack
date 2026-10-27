# Conteneurisation Docker — MediTrack

## Objectif

Conteneuriser l'application MediTrack de façon sécurisée, conformément aux
exigences DevSecOps : image minimale, utilisateur non-root, aucun secret
embarqué dans l'image.

## Choix techniques et justification sécurité

### Image de base : node:20-alpine

Alpine Linux est une distribution minimale (quelques Mo au lieu de
plusieurs centaines de Mo pour une image Debian/Ubuntu classique).
Moins de paquets système installés = moins de CVE potentielles = surface
d'attaque réduite. C'est directement vérifiable par le scan Trivy
(Personne 2) : une image alpine remonte généralement beaucoup moins de
vulnérabilités qu'une image complète.

### Multi-stage build

Le Dockerfile sépare la construction (installation des dépendances avec
npm) de l'exécution. Résultat : l'image finale ne contient aucun outil
de build inutile, seulement le code et les dépendances de production.
Image plus légère, surface d'attaque plus réduite.

### Utilisateur non-root

Par défaut, un conteneur Docker s'exécute en tant que root. Si une faille
applicative est exploitée (par exemple VULN-03, l'endpoint /debug exposé),
un attaquant qui obtiendrait une exécution de code serait root DANS le
conteneur, ce qui augmente l'impact. On crée donc un utilisateur dédié
(`meditrack`) sans privilèges, utilisé via l'instruction USER.

Vérifié avec : "docker run --rm meditrack:latest whoami"
Résultat : `meditrack` (pas `root`).

### .dockerignore

Empêche que des fichiers sensibles (`.env`, `.git`) ou inutiles
(`node_modules`, `docs/`) se retrouvent copiés dans l'image. Un `.env`
avec de vrais secrets copié par erreur dans une image serait extractible
par n'importe qui ayant accès à cette image — même avec des secrets
fictifs (VULN-04), c'est une bonne pratique à appliquer systématiquement.

### HEALTHCHECK

Utilise l'endpoint /health déjà existant dans l'application pour que
Docker (et plus tard Kubernetes) puisse savoir automatiquement si le
conteneur est fonctionnel ou plantée.

## Commandes utilisées

### Build de l'image
docker build -t meditrack:latest .

### Vérifier que l'utilisateur n'est pas root
docker run --rm meditrack:latest whoami

### Vérifier la taille de l'image
docker images meditrack

### Lancer l'application complète (app + base de données)
docker-compose up --build

### Vérifier l'état des conteneurs (healthcheck)
docker ps

## Résultat

- Image buildée avec succès
- Conteneur s'exécute avec l'utilisateur `meditrack` (non-root)
- Healthcheck passe à `healthy` après ~30 secondes
- Application accessible sur http://localhost:3000
- Base de données PostgreSQL connectée et fonctionnelle

## Limite importante

La conteneurisation Docker sécurise l'infrastructure d'exécution, mais ne
corrige PAS les vulnérabilités applicatives documentées dans
`docs/vulnerabilites.md` (VULN-01 à VULN-07). Ces failles restent
présentes et exploitables à l'intérieur du conteneur — c'est normal et
volontaire à ce stade du projet, elles seront corrigées dans les étapes
suivantes du pipeline DevSecOps.