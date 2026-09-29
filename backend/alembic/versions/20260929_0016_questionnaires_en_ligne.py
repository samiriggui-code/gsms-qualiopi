"""questionnaires en ligne

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-29 16:23:12.440536
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0016'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('questionnaire_invitation',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('enrollment_id', sa.String(length=36), nullable=False),
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('respondent', sa.String(length=20), nullable=False),
    sa.Column('expires_on', sa.Date(), nullable=False),
    sa.Column('opened_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('answered_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('questionnaire_version', sa.Integer(), nullable=True),
    sa.Column('answers', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_questionnaire_invitation')),
    sa.UniqueConstraint('enrollment_id', 'kind', name=op.f('uq_questionnaire_invitation_enrollment_id')),
    schema='communication'
    )
    op.create_index(op.f('ix_communication_questionnaire_invitation_enrollment_id'), 'questionnaire_invitation', ['enrollment_id'], unique=False, schema='communication')
    op.create_index(op.f('ix_communication_questionnaire_invitation_session_id'), 'questionnaire_invitation', ['session_id'], unique=False, schema='communication')


def downgrade() -> None:
    op.drop_index(op.f('ix_communication_questionnaire_invitation_session_id'), table_name='questionnaire_invitation', schema='communication')
    op.drop_index(op.f('ix_communication_questionnaire_invitation_enrollment_id'), table_name='questionnaire_invitation', schema='communication')
    op.drop_table('questionnaire_invitation', schema='communication')
