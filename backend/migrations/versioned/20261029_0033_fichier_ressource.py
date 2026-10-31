"""ressources pédagogiques : fichier du contenu (nom, type, chemin du stockage, empreinte)

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-29 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0033'
down_revision: Union[str, None] = '0032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('program_resource', sa.Column('file_name', sa.String(length=250), nullable=True), schema='formation')
    op.add_column('program_resource', sa.Column('mime_type', sa.String(length=80), nullable=True), schema='formation')
    op.add_column('program_resource', sa.Column('storage_path', sa.String(length=400), nullable=True),
                  schema='formation')
    op.add_column('program_resource', sa.Column('sha256', sa.String(length=64), nullable=True), schema='formation')


def downgrade() -> None:
    for column in ('sha256', 'storage_path', 'mime_type', 'file_name'):
        op.drop_column('program_resource', column, schema='formation')
