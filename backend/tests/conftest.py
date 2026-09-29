"""Tests sur un vrai PostgreSQL.

Une base neuve est créée pour la session de tests, migrée avec Alembic (pas de create_all :
on teste le schéma réellement déployé), puis vidée entre chaque test.

Variable : TEST_DATABASE_URL = URL d'une base d'administration (par défaut `postgres` en local).
"""

from __future__ import annotations

import os
import tempfile
import uuid
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from fastapi.testclient import TestClient

    from app.auth.models import User

os.environ.setdefault("JWT_SECRET", "secret-de-test-assez-long-pour-hs256-0123456789")
os.environ.setdefault("DOCUMENTS_DIR", tempfile.mkdtemp(prefix="gsms-docs-"))

from app.core import db as core_db  # noqa: E402
from app.models import SCHEMAS  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
ADMIN_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/postgres")


def alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    name = f"gsms_test_{uuid.uuid4().hex[:10]}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    url = make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
    try:
        command.upgrade(alembic_config(url), "head")
        os.environ["DATABASE_URL"] = url
        core_db.reset_engine(url)
        yield url
    finally:
        core_db.get_engine().dispose()
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def _truncate_all(url: str) -> None:
    engine = core_db.get_engine()
    with engine.begin() as c:
        tables = c.execute(
            text(
                "SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) FROM pg_tables "
                "WHERE schemaname = ANY(:schemas)"
            ),
            {"schemas": list(SCHEMAS)},
        ).scalars().all()
        if tables:
            c.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db(database_url: str) -> Iterator[Session]:
    _truncate_all(database_url)
    session = core_db.session_factory()()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ── API ──────────────────────────────────────────────────────────────────────────


@pytest.fixture
def client(db: Session) -> Iterator["TestClient"]:
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


def make_user(db: Session, role: str, email: str | None = None) -> tuple["User", dict]:
    """Crée un utilisateur et renvoie les en-têtes d'authentification."""
    from app.auth.models import User
    from app.auth.security import create_token, hash_password

    user = User(email=email or f"{role}@test.local", full_name=f"Test {role}", password_hash=hash_password("mot-de-passe-test"), role=role)
    db.add(user)
    db.commit()
    return user, {"Authorization": f"Bearer {create_token(user)}"}


# ── Démo ─────────────────────────────────────────────────────────────────────────

V9 = BACKEND_DIR / "referentials" / "qualiopi" / "v9"
TODAY = date.today()


@pytest.fixture
def demo(db: Session) -> Session:
    """Référentiel V9 actif + organisme de démo évalué (14 trous plantés)."""
    from app.demo import seed_demo
    from app.qualiopi.engine import refresh_all
    from app.qualiopi.referential.importer import import_referential

    version = import_referential(db, V9)
    seed_demo(db, today=TODAY)
    refresh_all(db, trigger="test", today=TODAY)
    db.commit()
    db.info["version"] = version
    return db


def find_session(db: Session, ref: str):  # noqa: ANN201
    from app.training import models as t

    return db.scalar(select(t.TrainingSession).where(t.TrainingSession.reference == ref))


def target_names(db: Session) -> dict[str, str]:
    from app.training import models as t

    names = {s.id: s.reference for s in db.scalars(select(t.TrainingSession))}
    names |= {p.id: p.code for p in db.scalars(select(t.Program))}
    return names
