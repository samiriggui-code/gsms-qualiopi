#!/usr/bin/env bash
# Lance GSMS Qualiopi en local sur UNE seule adresse : http://localhost:${PORT:-4150}
# (et depuis le téléphone, la tablette ou le portable : http://<IP du PC>:${PORT:-4150})
#   /        → landing (site public)
#   /app/    → back-office (coque Global-IT-SS, Vue 3 + TDesign)
#   /api/    → API FastAPI de qualiopi (backend/)
# Prérequis : l'API tourne, par défaut sur :8000 (cd backend && uvicorn app.cmd.server:app --reload,
# ou docker compose up -d). Autre adresse : API=http://127.0.0.1:18000 ./scripts/dev.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-4150}"
LANDING_PORT="${LANDING_PORT:-4152}"
API="${API:-http://127.0.0.1:8000}"

# La landing (Next.js) écoute en local ; le serveur du back-office lui renvoie tout ce qui n'est pas /app.
cd "$ROOT/landing" && npx next dev -H 127.0.0.1 -p "$LANDING_PORT" &
LANDING_PID=$!
trap 'kill $LANDING_PID 2>/dev/null' EXIT

cd "$ROOT/app" && VITE_BASE_PATH=/app/ VITE_DEV_PROXY_TARGET="$API" LANDING_DEV_SERVER="http://127.0.0.1:$LANDING_PORT" \
  npx vite --port "$PORT" --host 0.0.0.0 --strictPort
