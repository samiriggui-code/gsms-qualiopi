"""created_by sur les tables horodatées

La migration 0001 a été générée avant l'ajout de `created_by` au TimestampMixin :
le modèle déclarait la colonne mais la base ne l'avait pas, et tout INSERT échouait.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Toutes les tables qui héritent de TimestampMixin.
TABLES = (
    ("iam", "user"),
    ("formation", "agreement"),
    ("formation", "assessment"),
    ("formation", "attendance_signature"),
    ("formation", "attendance_slot"),
    ("formation", "certificate"),
    ("formation", "company"),
    ("formation", "complaint"),
    ("formation", "convocation"),
    ("formation", "document"),
    ("formation", "enrollment"),
    ("formation", "learner"),
    ("formation", "needs_analysis"),
    ("formation", "organization"),
    ("formation", "partner"),
    ("formation", "positioning"),
    ("formation", "program"),
    ("formation", "satisfaction_survey"),
    ("formation", "session"),
    ("formation", "staff_development_action"),
    ("formation", "subcontractor"),
    ("formation", "trainer"),
    ("formation", "trainer_qualification"),
    ("formation", "watch_item"),
    ("qualite", "audit"),
    ("qualite", "capa_action"),
    ("qualite", "evidence"),
    ("qualite", "finding"),
    ("qualite", "referential_version"),
)


def upgrade() -> None:
    for schema, table in TABLES:
        op.add_column(table, sa.Column("created_by", sa.String(length=200), nullable=True), schema=schema)


def downgrade() -> None:
    for schema, table in TABLES:
        op.drop_column(table, "created_by", schema=schema)
