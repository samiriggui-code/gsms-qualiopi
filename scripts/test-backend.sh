#!/usr/bin/env bash
# Vérifications du backend dans un conteneur Python 3.12 (même version que l'image de l'API),
# contre une base PostgreSQL jetable (conteneur gsms-test-db, port local 55432).
# Usage : ./scripts/test-backend.sh [arguments de pytest]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker start gsms-test-db >/dev/null 2>&1 || docker run -d --name gsms-test-db -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:55432:5432 postgres:16-alpine >/dev/null
docker run --rm --network host -v "$ROOT/backend:/src" -w /src \
  -e TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:55432/postgres \
  -e DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:55432/postgres \
  -e JWT_SECRET=test-secret-test-secret-test-secret-0123456789 \
  -e PYTHONDONTWRITEBYTECODE=1 \
  gsms-backend-test sh -c "ruff check . && python -m pytest -q -p no:cacheprovider $*"
