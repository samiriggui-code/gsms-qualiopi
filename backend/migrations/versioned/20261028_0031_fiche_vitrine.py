"""fiche formation : débouchés, effectif par session, conditions d'accès et badge repris de la fiche vitrine

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-28 22:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0031'
down_revision: Union[str, None] = '0030'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('program', sa.Column('outcomes', sa.JSON(), server_default='[]', nullable=False), schema='formation')
    op.add_column('program', sa.Column('trainees_min', sa.Integer(), nullable=True), schema='formation')
    op.add_column('program', sa.Column('trainees_max', sa.Integer(), nullable=True), schema='formation')
    op.add_column('program', sa.Column('access_conditions', sa.JSON(), server_default='[]', nullable=False),
                  schema='formation')
    op.add_column('program', sa.Column('badge', sa.String(length=60), nullable=True), schema='formation')


def downgrade() -> None:
    for column in ('badge', 'access_conditions', 'trainees_max', 'trainees_min', 'outcomes'):
        op.drop_column('program', column, schema='formation')
