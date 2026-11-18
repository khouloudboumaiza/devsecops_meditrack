# Observabilité et réponse à incident

## Lancement
```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d --build
```
- Application : http://localhost:3000 (métriques : `/metrics`)
- Prometheus : http://localhost:9090 (cibles `/targets`, alertes `/alerts`)
- Grafana : http://localhost:3001 (utilisateur `admin`, mot de passe `GRAFANA_ADMIN_PASSWORD` du fichier `.env`)
  → Dashboards → MediTrack → « MediTrack — Sécurité »

Prometheus et Grafana ne sont ouverts que sur 127.0.0.1.

## Alertes de sécurité (`monitoring/alerts.yml`)
| Alerte | Condition | Sévérité |
|---|---|---|
| ForceBruteConnexion | plus de 10 réponses 401 en 1 min sur `/api/auth/login` | critical |
| AccesRefusesEnRafale | plus de 5 réponses 403 en 1 min | warning |
| ApplicationIndisponible | `/metrics` illisible pendant 30 s | critical |

## Simulation d'attaque
`bash scripts/simulation-attaque.sh` (application locale uniquement) : 30 échecs de connexion
espacés d'une seconde, puis tentative d'IDOR sur les dossiers 1 à 15 avec le compte patient1.

## Plan de réponse à incident
1. **Détection** : alerte Prometheus/Grafana, confirmée dans les journaux JSON (`login_failed`).
2. **Confinement** : désactivation du compte visé depuis la page Administration → Utilisateurs.
3. **Éradication** : réinitialisation du mot de passe (nouvelle empreinte bcrypt en base).
4. **Rétablissement** : réactivation du compte, vérification de la connexion, alertes revenues à Inactive.
5. **Retour d'expérience** : documenter la chronologie, ajouter une limitation du nombre d'essais de connexion.
