#!/usr/bin/env bash
# Simulation d'attaque (application LOCALE de l'équipe uniquement) :
#   1) force brute sur la connexion de medecin1
#   2) tentative d'IDOR avec le compte patient1
BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

echo "=== 1) Force brute : 30 mauvais mots de passe pour medecin1 ==="
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -d '{"email":"medecin1@meditrack.test","password":"mauvais-mdp-'"$i"'"}' \
    "$BASE/api/auth/login")
  echo "essai $i -> HTTP $code"
  # Ne pas retirer : Prometheus relève les compteurs toutes les 5 s ;
  # une rafale instantanée tiendrait dans un seul relevé et ne serait pas mesurée.
  sleep 1
done

echo
echo "=== 2) Tentative d'IDOR : patient1 demande les dossiers 1 à 15 ==="
curl -s -o /dev/null -c "$JAR" -H 'Content-Type: application/json' \
  -d '{"email":"patient1@meditrack.test","password":"Password123!"}' \
  "$BASE/api/auth/login"
for id in $(seq 1 15); do
  code=$(curl -s -o /dev/null -b "$JAR" -w '%{http_code}' "$BASE/records/$id")
  echo "/records/$id -> HTTP $code"
  sleep 1
done
echo
echo "Simulation terminée."
