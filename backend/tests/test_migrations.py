"""Le schéma migré doit correspondre exactement aux modèles (la dérive `created_by` ne doit plus revenir)."""

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine

from app.models import SCHEMAS, metadata
from tests.conftest import alembic_config


def _include_name(name, type_, parent_names):  # noqa: ANN001, ANN202
    return name in SCHEMAS if type_ == "schema" else True


def _diff(url: str) -> list:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            ctx = MigrationContext.configure(
                conn,
                opts={"include_schemas": True, "include_name": _include_name, "compare_type": True},
            )
            return compare_metadata(ctx, metadata)
    finally:
        engine.dispose()


def test_schema_migre_identique_aux_modeles(database_url: str) -> None:
    assert _diff(database_url) == []


def test_migrations_reversibles(database_url: str) -> None:
    cfg = alembic_config(database_url)
    command.downgrade(cfg, "0001")
    command.upgrade(cfg, "head")
    assert _diff(database_url) == []
