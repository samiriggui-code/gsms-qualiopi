"""grille cochée au dépôt, pièce papier, séparation dépôt / validation

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-29 19:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('document', sa.Column('support', sa.String(length=20), server_default='FICHIER', nullable=False), schema='formation')
    op.add_column('document', sa.Column('checklist', sa.JSON(), nullable=True), schema='formation')
    op.add_column('document', sa.Column('checklist_note', sa.Text(), nullable=True), schema='formation')
    op.add_column('organization', sa.Column('allow_self_validation', sa.Boolean(), server_default=sa.false(), nullable=False), schema='formation')
    op.add_column('evidence_validation', sa.Column('self_validated', sa.Boolean(), server_default=sa.false(), nullable=False), schema='qualite')


def downgrade() -> None:
    op.drop_column('evidence_validation', 'self_validated', schema='qualite')
    op.drop_column('organization', 'allow_self_validation', schema='formation')
    op.drop_column('document', 'checklist_note', schema='formation')
    op.drop_column('document', 'checklist', schema='formation')
    op.drop_column('document', 'support', schema='formation')
