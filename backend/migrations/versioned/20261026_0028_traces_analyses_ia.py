"""traces des analyses du moteur IA (contrat gsms.ia.analyse-indicateur)

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-26 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0028'
down_revision: Union[str, None] = '0027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ia_analyse',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('contract', sa.String(length=60), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('indicator_number', sa.Integer(), nullable=False),
        sa.Column('referential_version', sa.String(length=20), nullable=False),
        sa.Column('engine_status', sa.String(length=30), nullable=False),
        sa.Column('question_sha256', sa.String(length=64), nullable=True),
        sa.Column('allowed_documents', sa.JSON(), nullable=False),
        sa.Column('consulted_documents', sa.JSON(), nullable=False),
        sa.Column('chunk_ids', sa.JSON(), nullable=False),
        sa.Column('rejected_references', sa.Integer(), nullable=False),
        sa.Column('embedding_model', sa.String(length=120), nullable=True),
        sa.Column('reference_status', sa.String(length=30), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=False),
        sa.Column('validation_status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='qualite',
    )
    op.create_index(op.f('ix_qualite_ia_analyse_user_id'), 'ia_analyse', ['user_id'], unique=False, schema='qualite')
    op.create_index(op.f('ix_qualite_ia_analyse_indicator_number'), 'ia_analyse', ['indicator_number'], unique=False,
                    schema='qualite')
    op.create_index(op.f('ix_qualite_ia_analyse_created_at'), 'ia_analyse', ['created_at'], unique=False, schema='qualite')


def downgrade() -> None:
    op.drop_index(op.f('ix_qualite_ia_analyse_created_at'), table_name='ia_analyse', schema='qualite')
    op.drop_index(op.f('ix_qualite_ia_analyse_indicator_number'), table_name='ia_analyse', schema='qualite')
    op.drop_index(op.f('ix_qualite_ia_analyse_user_id'), table_name='ia_analyse', schema='qualite')
    op.drop_table('ia_analyse', schema='qualite')
