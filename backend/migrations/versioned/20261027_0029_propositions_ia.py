"""propositions de l'IA soumises à décision humaine ; trace de l'analyse par le modèle

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-27 02:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0029'
down_revision: Union[str, None] = '0028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ia_proposition',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('analysis_id', sa.String(length=36), nullable=False),
        sa.Column('indicator_number', sa.Integer(), nullable=False),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('justification', sa.Text(), nullable=False),
        sa.Column('passages', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('decided_by', sa.String(length=36), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decision_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='qualite',
    )
    op.create_index(op.f('ix_qualite_ia_proposition_analysis_id'), 'ia_proposition', ['analysis_id'], unique=False,
                    schema='qualite')
    op.create_index(op.f('ix_qualite_ia_proposition_indicator_number'), 'ia_proposition', ['indicator_number'],
                    unique=False, schema='qualite')
    op.create_index(op.f('ix_qualite_ia_proposition_status'), 'ia_proposition', ['status'], unique=False,
                    schema='qualite')
    op.add_column('ia_analyse', sa.Column('generation_model', sa.String(length=120), nullable=True), schema='qualite')
    op.add_column('ia_analyse', sa.Column('observations_kept', sa.Integer(), nullable=True), schema='qualite')
    op.add_column('ia_analyse', sa.Column('observations_rejected', sa.Integer(), nullable=True), schema='qualite')


def downgrade() -> None:
    op.drop_column('ia_analyse', 'observations_rejected', schema='qualite')
    op.drop_column('ia_analyse', 'observations_kept', schema='qualite')
    op.drop_column('ia_analyse', 'generation_model', schema='qualite')
    op.drop_index(op.f('ix_qualite_ia_proposition_status'), table_name='ia_proposition', schema='qualite')
    op.drop_index(op.f('ix_qualite_ia_proposition_indicator_number'), table_name='ia_proposition', schema='qualite')
    op.drop_index(op.f('ix_qualite_ia_proposition_analysis_id'), table_name='ia_proposition', schema='qualite')
    op.drop_table('ia_proposition', schema='qualite')
