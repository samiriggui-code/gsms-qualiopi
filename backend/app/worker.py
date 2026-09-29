"""Worker du moteur Qualiopi.

  python -m app.worker            boucle : traite l'outbox toutes les N secondes
  python -m app.worker --once     traite l'outbox une fois
  python -m app.worker --full     réconciliation + réévaluation complète (à planifier chaque nuit)
"""

import argparse
import logging
import time

from app.core.db import session_factory
from app.qualiopi.engine import process_pending, refresh_all

log = logging.getLogger("qualiopi.worker")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--interval", type=float, default=5.0)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.full:
        with session_factory()() as db:
            log.info("réévaluation complète : %s", refresh_all(db, trigger="planifie"))
            db.commit()
        return
    while True:
        with session_factory()() as db:
            try:
                result = process_pending(db)
                db.commit()
                if result.get("events"):
                    log.info("événements traités : %s", result)
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("échec du traitement de l'outbox")
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
