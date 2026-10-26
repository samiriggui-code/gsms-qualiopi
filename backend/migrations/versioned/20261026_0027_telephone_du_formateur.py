"""téléphone du formateur (fiche complète, comme le personnel)

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-26 22:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0027'
down_revision: Union[str, None] = '0026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trainer', sa.Column('phone', sa.String(length=40), nullable=True), schema='formation')


def downgrade() -> None:
    op.drop_column('trainer', 'phone', schema='formation')
