"""Commandes d'exploitation.

  python -m app.cli create-admin EMAIL "NOM"      mot de passe lu dans GSMS_ADMIN_PASSWORD ou demandé
  python -m app.cli import-referential [qualiopi/v9 | qualiopi/v10]
  python -m app.cli seed-demo                      organisme de démo + réévaluation (base vide uniquement)
"""

import argparse
import getpass
import os
import sys

from sqlalchemy import select

from app.auth.models import User, UserRole
from app.auth.security import hash_password
from app.core.config import get_settings
from app.core.db import session_factory
from app.core.journal import set_actor
from app.qualiopi.engine import refresh_all
from app.qualiopi.referential.importer import import_referential

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
    from app.demo import PLANTED_GAPS
    from app.demo import seed_demo as build

    with session_factory()() as db:
        set_actor(db, "cli")
        # V9 en vigueur ; V10 importée inactive, activée par la passe de nuit le 1er novembre 2026.
        for folder in ("v9", "v10"):
            import_referential(db, get_settings().referentials_dir / "qualiopi" / folder)
        info = build(db)
        result = refresh_all(db, trigger="demo")
        db.commit()
    print(f"Démo installée : {', '.join(info['sessions'])} ; {result['results']} résultats de contrôle.")
    print(f"{len(PLANTED_GAPS)} trous plantés à retrouver dans les dossiers de session.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("create-admin")
    a.add_argument("email")
    a.add_argument("full_name")
    r = sub.add_parser("import-referential")
    r.add_argument("folder", nargs="?", default="qualiopi/v9")
    sub.add_parser("seed-demo")
    args = parser.parse_args()
    if args.cmd == "create-admin":
        create_admin(args.email, args.full_name)
    elif args.cmd == "import-referential":
        import_ref(args.folder)
    elif args.cmd == "seed-demo":
        seed_demo()


if __name__ == "__main__":
    main()
