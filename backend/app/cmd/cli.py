"""Commandes d'exploitation.

  python -m app.cmd.cli create-admin EMAIL "NOM"      mot de passe lu dans GSMS_ADMIN_PASSWORD ou demandé
  python -m app.cmd.cli import-referential [qualiopi/v9 | qualiopi/v10]
  python -m app.cmd.cli seed-demo                      données d'exemple (fictives) + réévaluation ; sur une base
                                                   qui a déjà un organisme, elles s'y ajoutent sans le modifier
  python -m app.cmd.cli retirer-demo                   retire toutes les données d'exemple + réévaluation
  python -m app.cmd.cli import-formssi                 données réelles de Form'SSI (établissement, TFP APS) pour EDOF
  python -m app.cmd.cli import-gsms-school             offre reprise de GSMS School (29 formations, lieux, équipements)
  python -m app.cmd.cli ia-preparer [--renouveler-jeton]
                                                   espace du moteur IA : serveur MCP Qualiopi et base « Référentiel
                                                   Qualiopi » (idempotent) ; --renouveler-jeton invalide l'ancien jeton
"""

import argparse
import getpass
import os
import sys

from sqlalchemy import select

from app.application.service.qualiopi.engine import refresh_all
from app.application.service.qualiopi.referential.importer import import_referential
from app.common.journal import set_actor
from app.config.config import get_settings
from app.database.db import session_factory
from app.middleware.auth import hash_password
from app.types.auth import User, UserRole

MIN_PASSWORD = 12


def create_admin(email: str, full_name: str) -> None:
    password = os.environ.get("GSMS_ADMIN_PASSWORD") or getpass.getpass("Mot de passe : ")
    if len(password) < MIN_PASSWORD:
        sys.exit(f"Mot de passe trop court ({MIN_PASSWORD} caractères minimum)")
    with session_factory()() as db:
        set_actor(db, "cli")
        email = email.lower().strip()
        if db.scalar(select(User).where(User.email == email)):
            sys.exit(f"{email} existe déjà")
        user = User(email=email, full_name=full_name, password_hash=hash_password(password), created_by="cli")
        user.role_links.append(UserRole(role="admin", created_by="cli"))
        db.add(user)
        db.commit()
    print(f"Administrateur créé : {email}")


def import_ref(folder: str) -> None:
    with session_factory()() as db:
        set_actor(db, "cli")
        v = import_referential(db, get_settings().referentials_dir / folder)
        db.commit()
        state = "actif" if v.is_active else f"inactif jusqu'à son entrée en vigueur le {v.effective_from:%d/%m/%Y}"
        print(f"{v.code} {v.version} importé, {state} ({len(v.indicators)} indicateurs)")


def seed_demo() -> None:
    from app.application.service.demo import PLANTED_GAPS
    from app.application.service.demo import seed_demo as build

    with session_factory()() as db:
        set_actor(db, "cli")
        # V9 en vigueur ; V10 importée inactive, activée par la passe de nuit le 1er novembre 2026.
        for folder in ("v9", "v10"):
            import_referential(db, get_settings().referentials_dir / "qualiopi" / folder)
        info = build(db)
        result = refresh_all(db, trigger="demo")
        db.commit()
    print(f"Données d'exemple installées : {', '.join(info['sessions'])} ; {result['results']} résultats de contrôle.")
    print(f"{len(PLANTED_GAPS)} trous plantés à retrouver dans les dossiers de session.")
    print("Pour les retirer plus tard : python -m app.cmd.cli retirer-demo")


def remove_demo() -> None:
    from app.application.service.demo import remove_demo as run

    with session_factory()() as db:
        removed = run(db)
        result = refresh_all(db, trigger="retrait-demo")
        db.commit()
    if not removed:
        print("Aucune donnée d'exemple à retirer.")
        return
    print("Données d'exemple retirées : " + ", ".join(f"{k} {v}" for k, v in removed.items()) + ".")
    print(f"Réévaluation : {result['results']} résultats de contrôle.")


def import_formssi() -> None:
    from app.application.service.edof.formssi import import_formssi as run

    with session_factory()() as db:
        set_actor(db, "cli")
        out = run(db)
        db.commit()
    print(f"{out['organisme']} : formations créées {', '.join(out['formations']) or 'aucune'}.")
    for line in out["report"]:
        print(f"  - {line}")


def import_gsms_school() -> None:
    from app.application.service.training.import_school import import_gsms_school as run

    with session_factory()() as db:
        set_actor(db, "cli")
        out = run(db)
        db.commit()
    print(f"Formations créées ({len(out['formations'])}) : {', '.join(out['formations']) or 'aucune'}.")
    print(f"Formations déjà présentes complétées ({len(out['completees'])}) : {', '.join(out['completees']) or 'aucune'}.")
    print(f"Lieux créés : {len(out['lieux'])} ; équipements créés : {out['equipements']} (statut « à vérifier sur place »).")
    for line in out["report"]:
        print(f"  - {line}")


def ia_prepare(renew: bool) -> None:
    from app.application.service.ia.espace import ensure_mcp_service, ensure_referential_kb
    from app.application.service.ia.session import IAUnavailable, open_session

    try:
        token = open_session()["token"]
    except IAUnavailable as e:
        sys.exit(str(e))
    failed = False
    with session_factory()() as db:
        set_actor(db, "cli")
        for title, step in (("Serveur MCP", lambda: ensure_mcp_service(db, token, renew=renew)),
                            ("Base de connaissances", lambda: ensure_referential_kb(token))):
            print(f"{title} :")
            try:
                report = step()
            except IAUnavailable as e:
                print(f"  ! {e}")
                failed = True
                continue
            for line in report.done:
                print(f"  - {line}")
            for line in report.problems:
                print(f"  ! {line}")
            failed = failed or not report.ok
    if failed:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cmd.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("create-admin")
    a.add_argument("email")
    a.add_argument("full_name")
    r = sub.add_parser("import-referential")
    r.add_argument("folder", nargs="?", default="qualiopi/v9")
    sub.add_parser("seed-demo")
    sub.add_parser("retirer-demo")
    sub.add_parser("import-formssi")
    sub.add_parser("import-gsms-school")
    ia = sub.add_parser("ia-preparer")
    ia.add_argument("--renouveler-jeton", action="store_true")
    args = parser.parse_args()
    if args.cmd == "create-admin":
        create_admin(args.email, args.full_name)
    elif args.cmd == "import-formssi":
        import_formssi()
    elif args.cmd == "import-gsms-school":
        import_gsms_school()
    elif args.cmd == "import-referential":
        import_ref(args.folder)
    elif args.cmd == "seed-demo":
        seed_demo()
    elif args.cmd == "retirer-demo":
        remove_demo()
    elif args.cmd == "ia-preparer":
        ia_prepare(args.renouveler_jeton)


if __name__ == "__main__":
    main()
