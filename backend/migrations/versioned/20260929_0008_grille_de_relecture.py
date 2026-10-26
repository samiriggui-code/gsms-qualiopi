"""grille de relecture des preuves

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-29 18:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('evidence_validation', sa.Column('checklist', sa.JSON(), nullable=True), schema='qualite')


def downgrade() -> None:
    op.drop_column('evidence_validation', 'checklist', schema='qualite')
