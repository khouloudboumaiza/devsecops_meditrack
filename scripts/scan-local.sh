#!/usr/bin/env bash
# =============================================================================
#  MediTrack - Lancer les scans de sécurité EN LOCAL avec Docker
#  (mêmes outils et mêmes versions que le pipeline CI/CD)
#
#  Usage (depuis la racine du projet, Docker Desktop démarré) :
#     bash scripts/scan-local.sh            # tous les scans
#     bash scripts/scan-local.sh gitleaks   # un seul scan
#        (gitleaks | semgrep | npm | trivy-fs | trivy-image)
#
#  Les rapports sont écrits dans le dossier reports/ (ignoré par Git).
# =============================================================================

# Git Bash / MSYS2 (Windows) : empêche la conversion automatique des chemins
# comme /src en C:/Program Files/Git/src
export MSYS_NO_PATHCONV=1

TRIVY_IMAGE="aquasec/trivy:0.69.3"
GITLEAKS_IMAGE="zricethezav/gitleaks:v8.28.0"
SEMGREP_IMAGE="semgrep/semgrep:1.184.0"
NODE_IMAGE="node:20-alpine"
APP_IMAGE="meditrack:latest"

# Chemin du projet compréhensible par Docker Desktop (Windows ou Linux/Mac)
if pwd -W >/dev/null 2>&1; then SRC="$(pwd -W)"; else SRC="$(pwd)"; fi
mkdir -p reports

RESULTS=()
record() { RESULTS+=("$(printf '%-12s %s' "$1" "$2")"); }

run_gitleaks() {
  echo; echo "===== [SECRETS] Gitleaks (VULN-04) ====="
  # safe.directory : le dossier monté appartient à un autre utilisateur que
  # celui du conteneur, Git refuserait sinon de lire l'historique
  docker run --rm -v "$SRC":/src -w /src --entrypoint sh "$GITLEAKS_IMAGE" -c \
    "git config --global --add safe.directory /src && gitleaks git . --config .gitleaks.toml --redact --verbose --report-format json --report-path reports/gitleaks-report.json"
  [ $? -eq 0 ] && record gitleaks "OK" || record gitleaks "BLOQUANT - secret(s) détecté(s)"
}

run_semgrep() {
  echo; echo "===== [SAST] Semgrep (VULN-01, VULN-06) ====="
  docker run --rm -e SEMGREP_SEND_METRICS=off -v "$SRC":/src -w /src "$SEMGREP_IMAGE" \
    semgrep scan --config .semgrep/meditrack-rules.yml \
    --config p/javascript --config p/expressjs --config p/nodejs \
    --json --output reports/semgrep-report.json >/dev/null 2>&1
  docker run --rm -e SEMGREP_SEND_METRICS=off -v "$SRC":/src -w /src "$SEMGREP_IMAGE" \
    semgrep scan --config .semgrep/meditrack-rules.yml \
    --config p/javascript --config p/expressjs --config p/nodejs \
    --severity ERROR --error
  [ $? -eq 0 ] && record semgrep "OK" || record semgrep "BLOQUANT - faille(s) ERROR"
}

run_npm() {
  echo; echo "===== [SCA] npm audit (VULN-05) ====="
  docker run --rm -v "$SRC":/src -w /src "$NODE_IMAGE" \
    sh -c "npm audit --omit=dev --json > reports/npm-audit.json; npm audit --omit=dev; npm audit --omit=dev --audit-level=critical >/dev/null"
  [ $? -eq 0 ] && record npm-audit "OK" || record npm-audit "BLOQUANT - dépendance CRITICAL"
}

run_trivy_fs() {
  echo; echo "===== [SCA] Trivy fs - dépendances (VULN-05) ====="
  docker run --rm -v "$SRC":/src -w /src -v trivy-cache:/root/.cache "$TRIVY_IMAGE" \
    fs --scanners vuln --severity HIGH,CRITICAL --format json --output reports/trivy-fs.json .
  docker run --rm -v "$SRC":/src -w /src -v trivy-cache:/root/.cache "$TRIVY_IMAGE" \
    fs --scanners vuln --severity HIGH,CRITICAL .
  docker run --rm -v "$SRC":/src -w /src -v trivy-cache:/root/.cache "$TRIVY_IMAGE" \
    fs --scanners vuln --severity CRITICAL --exit-code 1 --quiet . >/dev/null
  [ $? -eq 0 ] && record trivy-fs "OK (HIGH = warning)" || record trivy-fs "BLOQUANT - CRITICAL"
}

run_trivy_image() {
  echo; echo "===== [IMAGE] Trivy image ($APP_IMAGE) ====="
  docker build -q -t "$APP_IMAGE" . >/dev/null || { record trivy-image "ERREUR build"; return; }
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache \
    -v "$SRC":/src -w /src "$TRIVY_IMAGE" \
    image --severity HIGH,CRITICAL --format json --output reports/trivy-image.json "$APP_IMAGE"
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache "$TRIVY_IMAGE" \
    image --severity HIGH,CRITICAL "$APP_IMAGE"
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache "$TRIVY_IMAGE" \
    image --severity CRITICAL --exit-code 1 --quiet "$APP_IMAGE" >/dev/null
  [ $? -eq 0 ] && record trivy-image "OK (HIGH = warning)" || record trivy-image "BLOQUANT - CRITICAL"
}

case "${1:-all}" in
  gitleaks)    run_gitleaks ;;
  semgrep)     run_semgrep ;;
  npm)         run_npm ;;
  trivy-fs)    run_trivy_fs ;;
  trivy-image) run_trivy_image ;;
  all)         run_gitleaks; run_semgrep; run_npm; run_trivy_fs; run_trivy_image ;;
  *) echo "Scan inconnu : $1"; exit 2 ;;
esac

echo; echo "================ RÉSUMÉ (politique de blocage) ================"
printf '%s\n' "${RESULTS[@]}"
echo "Rapports JSON : reports/"
if printf '%s\n' "${RESULTS[@]}" | grep -q BLOQUANT; then
  echo "=> PIPELINE ROUGE : le déploiement serait bloqué."; exit 1
else
  echo "=> PIPELINE VERT : le déploiement serait autorisé."; exit 0
fi
