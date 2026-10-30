"""comptes WeKnora des personnes, pour que le serveur MCP réponde avec leurs droits

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-27 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0030'
down_revision: Union[str, None] = '0029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'compte_ia',
        sa.Column('weknora_user_id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('weknora_user_id'),
        schema='iam',
    )
    op.create_index(op.f('ix_iam_compte_ia_user_id'), 'compte_ia', ['user_id'], unique=False, schema='iam')


def downgrade() -> None:
    op.drop_index(op.f('ix_iam_compte_ia_user_id'), table_name='compte_ia', schema='iam')
    op.drop_table('compte_ia', schema='iam')
