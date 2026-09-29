"""relances et communications

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-29 16:05:53.760078
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "communication"')
    op.create_table('message',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('reference', sa.String(length=40), nullable=False),
    sa.Column('occurrence_key', sa.String(length=300), nullable=False),
    sa.Column('rule_key', sa.String(length=80), nullable=False),
    sa.Column('template', sa.String(length=80), nullable=False),
    sa.Column('template_version', sa.Integer(), nullable=False),
    sa.Column('channel', sa.String(length=20), nullable=False),
    sa.Column('external', sa.Boolean(), nullable=False),
    sa.Column('recipient_kind', sa.String(length=30), nullable=False),
    sa.Column('recipient_name', sa.String(length=200), nullable=True),
    sa.Column('recipient_email', sa.String(length=255), nullable=True),
    sa.Column('subject', sa.String(length=300), nullable=False),
    sa.Column('body_html', sa.Text(), nullable=False),
    sa.Column('body_text', sa.Text(), nullable=False),
    sa.Column('body_sha256', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('due_on', sa.Date(), nullable=False),
    sa.Column('session_id', sa.String(length=36), nullable=True),
    sa.Column('enrollment_id', sa.String(length=36), nullable=True),
    sa.Column('milestone_key', sa.String(length=80), nullable=True),
    sa.Column('indicators', sa.JSON(), nullable=False),
    sa.Column('validated_by', sa.String(length=200), nullable=True),
    sa.Column('validated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('provider_message_id', sa.String(length=300), nullable=True),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('cancel_reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_message')),
    sa.UniqueConstraint('occurrence_key', name=op.f('uq_message_occurrence_key')),
    sa.UniqueConstraint('reference', name=op.f('uq_message_reference')),
    schema='communication'
    )
    op.create_index(op.f('ix_communication_message_due_on'), 'message', ['due_on'], unique=False, schema='communication')
    op.create_index(op.f('ix_communication_message_enrollment_id'), 'message', ['enrollment_id'], unique=False, schema='communication')
    op.create_index(op.f('ix_communication_message_rule_key'), 'message', ['rule_key'], unique=False, schema='communication')
    op.create_index(op.f('ix_communication_message_session_id'), 'message', ['session_id'], unique=False, schema='communication')
    op.create_index(op.f('ix_communication_message_status'), 'message', ['status'], unique=False, schema='communication')


def downgrade() -> None:
    op.drop_index(op.f('ix_communication_message_status'), table_name='message', schema='communication')
    op.drop_index(op.f('ix_communication_message_session_id'), table_name='message', schema='communication')
    op.drop_index(op.f('ix_communication_message_rule_key'), table_name='message', schema='communication')
    op.drop_index(op.f('ix_communication_message_enrollment_id'), table_name='message', schema='communication')
    op.drop_index(op.f('ix_communication_message_due_on'), table_name='message', schema='communication')
    op.drop_table('message', schema='communication')
    op.execute('DROP SCHEMA IF EXISTS "communication"')
