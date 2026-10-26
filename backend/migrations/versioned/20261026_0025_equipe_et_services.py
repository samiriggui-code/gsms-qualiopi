"""équipe présentée sur le site et service du personnel

Formateur et personnel : `site_visible` (présenté sur le site), `site_title` (fonction affichée), `site_bio` (bio
courte) ; le personnel a aussi son `service` (DIRECTION, PEDAGOGIE, RH : volets de la page Personnel et du site).
Migration séparée de 0024, déjà appliquée sur la base de développement.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-26 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0025'
down_revision: Union[str, None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table, schema in (('trainer', 'formation'), ('staff_member', 'rh')):
        op.add_column(table, sa.Column('site_visible', sa.Boolean(), server_default='false', nullable=False), schema=schema)
        op.add_column(table, sa.Column('site_title', sa.String(length=200), nullable=True), schema=schema)
        op.add_column(table, sa.Column('site_bio', sa.Text(), nullable=True), schema=schema)
    op.add_column('staff_member', sa.Column('service', sa.String(length=20), nullable=True), schema='rh')


def downgrade() -> None:
    op.drop_column('staff_member', 'service', schema='rh')
    for table, schema in (('trainer', 'formation'), ('staff_member', 'rh')):
        for column in ('site_bio', 'site_title', 'site_visible'):
            op.drop_column(table, column, schema=schema)
