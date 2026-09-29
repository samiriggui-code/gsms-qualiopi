"""Base de démo neuve pour les tests de bout en bout du front (jamais en production).

Recrée la base `GSMS_E2E_DB`, applique les migrations, installe l'organisme de démonstration
et trois comptes (direction, gestion, formatrice reliée à Julie Martin).
Variables : GSMS_ADMIN_DB_URL (base d'administration PostgreSQL), GSMS_E2E_DB, GSMS_E2E_PASSWORD.
"""

import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

admin_url = os.environ.get("GSMS_ADMIN_DB_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/postgres")
name = os.environ.get("GSMS_E2E_DB", "gsms_e2e")
password = os.environ.get("GSMS_E2E_PASSWORD", "demo-gsms-2026")
if os.environ.get("APP_ENV") == "production":
    sys.exit("Refusé : base de démonstration en production")

admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
with admin.connect() as c:
    c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    c.execute(text(f'CREATE DATABASE "{name}"'))
url = make_url(admin_url).set(database=name).render_as_string(hide_password=False)
os.environ["DATABASE_URL"] = url

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

cfg = Config(str(BACKEND / "alembic.ini"))
cfg.set_main_option("script_location", str(BACKEND / "alembic"))
cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
command.upgrade(cfg, "head")

from app import cli  # noqa: E402
from app.auth.models import User, UserRole  # noqa: E402
from app.auth.security import hash_password  # noqa: E402
from app.core import db as core_db  # noqa: E402
from app.platform.settings import ConfigurationService  # noqa: E402
from app.questionnaires import service as questionnaires  # noqa: E402
from app.training import models as t  # noqa: E402

core_db.reset_engine(url)
cli.seed_demo()
with core_db.session_factory()() as db:
    accounts = {}
    for email, full_name, role in (
        ("direction@demo.fr", "Samia Direction", "admin"),
        ("gestion@demo.fr", "Sonia Gestion", "gestion"),
        ("julie@demo.fr", "Julie Martin", "formateur"),
    ):
        user = User(email=email, full_name=full_name, password_hash=hash_password(password), created_by="e2e")
        user.role_links.append(UserRole(role=role, created_by="e2e"))
        db.add(user)
        accounts[email] = user
    db.flush()
    db.scalar(select(t.Trainer).where(t.Trainer.last_name == "Martin")).user_id = accounts["julie@demo.fr"].id
    db.scalar(select(t.Organization)).name = "Form'SSI"
    ConfigurationService(db).set("attendance.weekdays", [1, 2, 3, 4, 5, 6, 7])
    db.flush()

    # Liens de questionnaire (un stagiaire par écran : une réponse ferme le lien), plus un lien expiré.
    s4 = db.scalar(select(t.TrainingSession).where(t.TrainingSession.reference == "SST-2026-04"))
    by_name = {e.learner.first_name: e for e in s4.enrollments}
    today = date.today()
    links = {}
    for key, first_name, kind in (
        ("ordinateur", "Nora", "BESOIN_POSITIONNEMENT"),
        ("mobile", "Zoé", "BESOIN_POSITIONNEMENT"),
        ("expire", "Éric", "SATISFACTION_CHAUD"),
    ):
        inv = questionnaires.get_or_create(db, by_name[first_name], kind, today)
        if key == "expire":
            inv.expires_on = today - timedelta(days=1)
        links[key] = questionnaires.link(inv).rsplit("/", 1)[1]
    db.commit()
    Path(os.environ.get("GSMS_E2E_LINKS", "/tmp/gsms-e2e-questionnaires.json")).write_text(json.dumps(links))
print(f"base {name} prête")
