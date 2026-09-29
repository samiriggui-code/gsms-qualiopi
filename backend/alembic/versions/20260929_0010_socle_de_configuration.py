"""socle de configuration : rôles en base, fonctionnalités, réglages datés

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-29 11:58:58.426504
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "config"')
    op.create_table('feature_state',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('feature', sa.String(length=60), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_feature_state')),
    sa.UniqueConstraint('feature', name=op.f('uq_feature_state_feature')),
    schema='config'
    )
    op.create_table('setting_value',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('key', sa.String(length=120), nullable=False),
    sa.Column('value', sa.JSON(), nullable=False),
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_setting_value')),
    schema='config'
    )
    op.create_index(op.f('ix_config_setting_value_key'), 'setting_value', ['key'], unique=False, schema='config')
    op.create_table('role',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('permissions', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_role')),
    sa.UniqueConstraint('code', name=op.f('uq_role_code')),
    schema='iam'
    )
    op.create_table('user_role',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('role', sa.String(length=40), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['iam.user.id'], name=op.f('fk_user_role_user_id_user'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_role')),
    sa.UniqueConstraint('user_id', 'role', name=op.f('uq_user_role_user_id')),
    schema='iam'
    )
    op.create_index(op.f('ix_iam_user_role_user_id'), 'user_role', ['user_id'], unique=False, schema='iam')
    # Reprise : le rôle unique de chaque compte devient une attribution de rôle.
    op.execute("""
        INSERT INTO iam.user_role (id, user_id, role, created_at, created_by, updated_at)
        SELECT gen_random_uuid()::text, id, role, now(), 'migration 0010', now() FROM iam."user"
    """)
    # Reprise : l'autorisation d'auto-validation devient un réglage daté.
    op.execute("""
        INSERT INTO config.setting_value (id, key, value, effective_from, reason, created_at, created_by, updated_at)
        SELECT gen_random_uuid()::text, 'quality.allow_self_validation', 'true'::json, current_date,
               'Reprise du paramètre de l''organisme (migration 0010)', now(), 'migration 0010', now()
        FROM formation.organization WHERE allow_self_validation
    """)
    op.drop_column('organization', 'allow_self_validation', schema='formation')
    op.drop_column('user', 'role', schema='iam')


def downgrade() -> None:
    op.add_column('user', sa.Column('role', sa.String(length=20), server_default='lecture', nullable=False), schema='iam')
    op.execute("""
        UPDATE iam."user" u SET role = r.role FROM (
            SELECT DISTINCT ON (user_id) user_id, role FROM iam.user_role
            WHERE role IN ('admin', 'qualite', 'assistant_qualite', 'gestion', 'lecture')
            ORDER BY user_id, array_position(ARRAY['admin', 'qualite', 'assistant_qualite', 'gestion', 'lecture'], role)
        ) r WHERE r.user_id = u.id
    """)
    op.add_column('organization', sa.Column('allow_self_validation', sa.Boolean(), server_default=sa.false(), nullable=False), schema='formation')
    op.drop_index(op.f('ix_iam_user_role_user_id'), table_name='user_role', schema='iam')
    op.drop_table('user_role', schema='iam')
    op.drop_table('role', schema='iam')
    op.drop_index(op.f('ix_config_setting_value_key'), table_name='setting_value', schema='config')
    op.drop_table('setting_value', schema='config')
    op.drop_table('feature_state', schema='config')
    op.execute('DROP SCHEMA IF EXISTS "config"')
