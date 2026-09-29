#!/usr/bin/env sh
# Attend PostgreSQL, applique les migrations, puis lance la commande (API ou worker).
# Adapté de mizan-backend/docker/entrypoint.sh (MIT) — voir THIRD_PARTY_NOTICES.md.
set -e

python - <<'PY'
import os, sys, time
import psycopg

url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
for attempt in range(60):
    try:
        psycopg.connect(url, connect_timeout=3).close()
        break
    except psycopg.OperationalError:
        time.sleep(2)
else:
    sys.exit("PostgreSQL injoignable après 120 s")
PY

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  alembic upgrade head
fi

exec "$@"
