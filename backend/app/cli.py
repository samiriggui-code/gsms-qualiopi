"""Commandes d'exploitation.

  python -m app.cli create-admin EMAIL "NOM"      mot de passe lu dans GSMS_ADMIN_PASSWORD ou demandé
  python -m app.cli import-referential [qualiopi/v9]
"""

import argparse
import getpass
import os
import sys

from sqlalchemy import select

from app.auth.models import User
from app.auth.security import hash_password
from app.core.config import get_settings
from app.core.db import session_factory
from app.qualiopi.referential.importer import import_referential

MIN_PASSWORD = 12


def create_admin(email: str, full_name: str) -> None:
    password = os.environ.get("GSMS_ADMIN_PASSWORD") or getpass.getpass("Mot de passe : ")
    if len(password) < MIN_PASSWORD:
        sys.exit(f"Mot de passe trop court ({MIN_PASSWORD} caractères minimum)")
    with session_factory()() as db:
        email = email.lower().strip()
        if db.scalar(select(User).where(User.email == email)):
            sys.exit(f"{email} existe déjà")
        db.add(User(email=email, full_name=full_name, password_hash=hash_password(password), role="admin", created_by="cli"))
        db.commit()
    print(f"Administrateur créé : {email}")


def import_ref(folder: str) -> None:
    with session_factory()() as db:
        v = import_referential(db, get_settings().referentials_dir / folder)
        db.commit()
        print(f"{v.code} {v.version} importé et actif ({len(v.indicators)} indicateurs)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("create-admin")
    a.add_argument("email")
    a.add_argument("full_name")
    r = sub.add_parser("import-referential")
    r.add_argument("folder", nargs="?", default="qualiopi/v9")
    args = parser.parse_args()
    if args.cmd == "create-admin":
        create_admin(args.email, args.full_name)
    elif args.cmd == "import-referential":
        import_ref(args.folder)


if __name__ == "__main__":
    main()
