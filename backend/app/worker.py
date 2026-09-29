"""Worker du moteur Qualiopi.

  python -m app.worker                 boucle : traite l'outbox toutes les N secondes,
                                       et fait une passe complète chaque nuit (--nightly-hour, UTC)
  python -m app.worker --once          traite l'outbox une fois
  python -m app.worker --full          réconciliation + réévaluation complète, puis s'arrête

La passe complète rattrape ce qu'aucun événement ne signale : le temps qui passe
(qualifications qui expirent, veille qui vieillit, réclamations qui dépassent le délai).
"""

import argparse
import logging
import time
from datetime import datetime, timezone

from app.core.db import session_factory
from app.core.errors import DomainError
from app.qualiopi.engine import process_pending, refresh_all

log = logging.getLogger("qualiopi.worker")


def run_full(trigger: str) -> None:
    with session_factory()() as db:
        log.info("réévaluation complète : %s", refresh_all(db, trigger=trigger))
        db.commit()


def run_pending() -> None:
    with session_factory()() as db:
        try:
            result = process_pending(db)
            db.commit()
            if result.get("events"):
                log.info("événements traités : %s", result)
        except DomainError as exc:
            db.rollback()
            log.warning("outbox en attente : %s", exc.message)
        except Exception:  # noqa: BLE001
            db.rollback()
            log.exception("échec du traitement de l'outbox")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--interval", type=float, default=5.0)
    parser.add_argument("--nightly-hour", type=int, default=2, help="heure UTC de la passe complète (-1 pour désactiver)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.full:
        run_full("planifie")
        return
    last_full_day = None
    while True:
        run_pending()
        if args.once:
            return
        now = datetime.now(timezone.utc)
        if args.nightly_hour >= 0 and now.hour == args.nightly_hour and last_full_day != now.date():
            try:
                run_full("nuit")
            except Exception:  # noqa: BLE001
                log.exception("échec de la passe complète")
            last_full_day = now.date()
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
