"""fiche formation : financements présentés (CPF, France Travail, entreprise et OPCO, personnel)

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-28 23:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0032'
down_revision: Union[str, None] = '0031'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('program', sa.Column('funding_channels', sa.JSON(), server_default='[]', nullable=False),
                  schema='formation')


def downgrade() -> None:
    op.drop_column('program', 'funding_channels', schema='formation')
