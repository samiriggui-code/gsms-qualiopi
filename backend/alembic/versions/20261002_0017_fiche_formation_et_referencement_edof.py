"""fiche formation unique (versions, certification, intervenants, contenus) et référencement EDOF

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-02 07:32:21.709900
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0017'
down_revision: Union[str, None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "edof"')
    op.create_table('establishment',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('organization_id', sa.String(length=36), nullable=False),
    sa.Column('legal_name', sa.String(length=250), nullable=True),
    sa.Column('legal_form', sa.String(length=80), nullable=True),
    sa.Column('structure_type', sa.String(length=40), nullable=True),
    sa.Column('address', sa.String(length=300), nullable=True),
    sa.Column('naf_code', sa.String(length=10), nullable=True),
    sa.Column('identity_source', sa.String(length=300), nullable=True),
    sa.Column('identity_checked_on', sa.Date(), nullable=True),
    sa.Column('representative_kind', sa.String(length=30), nullable=True),
    sa.Column('representative_name', sa.String(length=200), nullable=True),
    sa.Column('representative_role', sa.String(length=120), nullable=True),
    sa.Column('nda_checked_on', sa.Date(), nullable=True),
    sa.Column('qualiopi_certificate', sa.String(length=80), nullable=True),
    sa.Column('qualiopi_certifier', sa.String(length=200), nullable=True),
    sa.Column('qualiopi_valid_until', sa.Date(), nullable=True),
    sa.Column('qualiopi_categories', sa.JSON(), server_default='[]', nullable=False),
    sa.Column('qualiopi_checked_on', sa.Date(), nullable=True),
    sa.Column('efp_connect_status', sa.String(length=30), server_default='AUCUN', nullable=False),
    sa.Column('efp_connect_updated_on', sa.Date(), nullable=True),
    sa.Column('obligations_checked_on', sa.Date(), nullable=True),
    sa.Column('bpf_last_year', sa.Integer(), nullable=True),
    sa.Column('cgu_version_read', sa.String(length=20), nullable=True),
    sa.Column('cgu_read_on', sa.Date(), nullable=True),
    sa.Column('uses_subcontracting', sa.Boolean(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['formation.organization.id'], name=op.f('fk_establishment_organization_id_organization'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_establishment')),
    sa.UniqueConstraint('organization_id', name=op.f('uq_establishment_organization_id')),
    schema='edof'
    )
    op.create_table('program_certification',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('program_id', sa.String(length=36), nullable=False),
    sa.Column('basis', sa.String(length=20), server_default='A_DETERMINER', nullable=False),
    sa.Column('code', sa.String(length=20), nullable=True),
    sa.Column('title', sa.String(length=250), nullable=True),
    sa.Column('certifier', sa.String(length=250), nullable=True),
    sa.Column('registration_end', sa.Date(), nullable=True),
    sa.Column('source_url', sa.String(length=400), nullable=True),
    sa.Column('checked_on', sa.Date(), nullable=True),
    sa.Column('checked_by', sa.String(length=200), nullable=True),
    sa.Column('habilitation', sa.String(length=20), server_default='A_VERIFIER', nullable=False),
    sa.Column('partner_siret', sa.String(length=20), nullable=True),
    sa.Column('habilitation_checked_on', sa.Date(), nullable=True),
    sa.Column('habilitation_checked_by', sa.String(length=200), nullable=True),
    sa.Column('evaluator_name', sa.String(length=250), nullable=True),
    sa.Column('competence_mapping', sa.JSON(), server_default='[]', nullable=False),
    sa.Column('other_requirements', sa.JSON(), server_default='[]', nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['program_id'], ['formation.program.id'], name=op.f('fk_program_certification_program_id_program'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_program_certification')),
    sa.UniqueConstraint('program_id', name=op.f('uq_program_certification_program_id')),
    schema='formation'
    )
    op.create_table('program_resource',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('program_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=250), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('module_code', sa.String(length=20), nullable=True),
    sa.Column('origin', sa.String(length=20), nullable=False),
    sa.Column('source_ref', sa.String(length=300), nullable=True),
    sa.Column('rights', sa.String(length=20), nullable=False),
    sa.Column('rights_note', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['program_id'], ['formation.program.id'], name=op.f('fk_program_resource_program_id_program'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_program_resource')),
    schema='formation'
    )
    op.create_index(op.f('ix_formation_program_resource_program_id'), 'program_resource', ['program_id'], unique=False, schema='formation')
    op.create_table('program_version',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('program_id', sa.String(length=36), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('snapshot', sa.JSON(), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('validated_by', sa.String(length=200), nullable=False),
    sa.Column('validated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['program_id'], ['formation.program.id'], name=op.f('fk_program_version_program_id_program'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_program_version')),
    sa.UniqueConstraint('program_id', 'version', name=op.f('uq_program_version_program_id')),
    schema='formation'
    )
    op.create_index(op.f('ix_formation_program_version_program_id'), 'program_version', ['program_id'], unique=False, schema='formation')
    op.create_table('dossier',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('organization_id', sa.String(length=36), nullable=False),
    sa.Column('program_id', sa.String(length=36), nullable=True),
    sa.Column('parent_id', sa.String(length=36), nullable=True),
    sa.Column('status', sa.String(length=30), server_default='EN_PREPARATION', nullable=False),
    sa.Column('validated_by', sa.String(length=200), nullable=True),
    sa.Column('validated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('submitted_on', sa.Date(), nullable=True),
    sa.Column('submitted_by', sa.String(length=200), nullable=True),
    sa.Column('cdc_reference', sa.String(length=80), nullable=True),
    sa.Column('program_version_id', sa.String(length=36), nullable=True),
    sa.Column('submission_snapshot', sa.JSON(), nullable=True),
    sa.Column('decision', sa.String(length=20), nullable=True),
    sa.Column('decision_on', sa.Date(), nullable=True),
    sa.Column('decision_note', sa.Text(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['formation.organization.id'], name=op.f('fk_dossier_organization_id_organization'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['parent_id'], ['edof.dossier.id'], name=op.f('fk_dossier_parent_id_dossier'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['program_id'], ['formation.program.id'], name=op.f('fk_dossier_program_id_program'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['program_version_id'], ['formation.program_version.id'], name=op.f('fk_dossier_program_version_id_program_version'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_dossier')),
    sa.UniqueConstraint('kind', 'program_id', name=op.f('uq_dossier_kind')),
    schema='edof'
    )
    op.create_table('program_trainer',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('program_id', sa.String(length=36), nullable=False),
    sa.Column('trainer_id', sa.String(length=36), nullable=False),
    sa.Column('role', sa.String(length=30), nullable=False),
    sa.Column('modules', sa.JSON(), server_default='[]', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['program_id'], ['formation.program.id'], name=op.f('fk_program_trainer_program_id_program'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['trainer_id'], ['formation.trainer.id'], name=op.f('fk_program_trainer_trainer_id_trainer'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_program_trainer')),
    sa.UniqueConstraint('program_id', 'trainer_id', name=op.f('uq_program_trainer_program_id')),
    schema='formation'
    )
    op.create_table('accompaniment',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('dossier_id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('label', sa.String(length=250), nullable=False),
    sa.Column('planned_on', sa.Date(), nullable=True),
    sa.Column('done_on', sa.Date(), nullable=True),
    sa.Column('participant', sa.String(length=200), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['dossier_id'], ['edof.dossier.id'], name=op.f('fk_accompaniment_dossier_id_dossier'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_accompaniment')),
    schema='edof'
    )
    op.create_index(op.f('ix_edof_accompaniment_dossier_id'), 'accompaniment', ['dossier_id'], unique=False, schema='edof')
    op.create_table('piece',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('dossier_id', sa.String(length=36), nullable=False),
    sa.Column('requirement', sa.String(length=60), nullable=False),
    sa.Column('document_id', sa.String(length=36), nullable=False),
    sa.Column('shared', sa.Boolean(), nullable=False),
    sa.Column('issued_on', sa.Date(), nullable=True),
    sa.Column('valid_until', sa.Date(), nullable=True),
    sa.Column('siret_on_document', sa.String(length=20), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('validated_by', sa.String(length=200), nullable=True),
    sa.Column('validated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rejection_reason', sa.Text(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('replaced_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['formation.document.id'], name=op.f('fk_piece_document_id_document'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['dossier_id'], ['edof.dossier.id'], name=op.f('fk_piece_dossier_id_dossier'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_piece')),
    schema='edof'
    )
    op.create_index(op.f('ix_edof_piece_dossier_id'), 'piece', ['dossier_id'], unique=False, schema='edof')
    op.create_table('complement',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('dossier_id', sa.String(length=36), nullable=False),
    sa.Column('label', sa.String(length=300), nullable=False),
    sa.Column('requirement', sa.String(length=60), nullable=True),
    sa.Column('requested_on', sa.Date(), nullable=False),
    sa.Column('due_on', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('piece_id', sa.String(length=36), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['dossier_id'], ['edof.dossier.id'], name=op.f('fk_complement_dossier_id_dossier'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['piece_id'], ['edof.piece.id'], name=op.f('fk_complement_piece_id_piece'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_complement')),
    schema='edof'
    )
    op.create_index(op.f('ix_edof_complement_dossier_id'), 'complement', ['dossier_id'], unique=False, schema='edof')
    op.add_column('program', sa.Column('audience', sa.Text(), nullable=True), schema='formation')
    op.add_column('program', sa.Column('skills', sa.JSON(), server_default='[]', nullable=False), schema='formation')
    op.add_column('program', sa.Column('delivery_mode', sa.String(length=20), nullable=True), schema='formation')
    op.add_column('program', sa.Column('modules', sa.JSON(), server_default='[]', nullable=False), schema='formation')
    op.add_column('program', sa.Column('teaching_means', sa.Text(), nullable=True), schema='formation')
    op.add_column('program', sa.Column('catalog_slug', sa.String(length=80), nullable=True), schema='formation')
    op.add_column('program', sa.Column('review_notes', sa.JSON(), server_default='[]', nullable=False), schema='formation')
    op.create_unique_constraint(op.f('uq_program_catalog_slug'), 'program', ['catalog_slug'], schema='formation')


def downgrade() -> None:
    op.drop_constraint(op.f('uq_program_catalog_slug'), 'program', schema='formation', type_='unique')
    op.drop_column('program', 'review_notes', schema='formation')
    op.drop_column('program', 'catalog_slug', schema='formation')
    op.drop_column('program', 'teaching_means', schema='formation')
    op.drop_column('program', 'modules', schema='formation')
    op.drop_column('program', 'delivery_mode', schema='formation')
    op.drop_column('program', 'skills', schema='formation')
    op.drop_column('program', 'audience', schema='formation')
    op.drop_index(op.f('ix_edof_complement_dossier_id'), table_name='complement', schema='edof')
    op.drop_table('complement', schema='edof')
    op.drop_index(op.f('ix_edof_piece_dossier_id'), table_name='piece', schema='edof')
    op.drop_table('piece', schema='edof')
    op.drop_index(op.f('ix_edof_accompaniment_dossier_id'), table_name='accompaniment', schema='edof')
    op.drop_table('accompaniment', schema='edof')
    op.drop_table('program_trainer', schema='formation')
    op.drop_table('dossier', schema='edof')
    op.drop_index(op.f('ix_formation_program_version_program_id'), table_name='program_version', schema='formation')
    op.drop_table('program_version', schema='formation')
    op.drop_index(op.f('ix_formation_program_resource_program_id'), table_name='program_resource', schema='formation')
    op.drop_table('program_resource', schema='formation')
    op.drop_table('program_certification', schema='formation')
    op.drop_table('establishment', schema='edof')
    op.execute('DROP SCHEMA IF EXISTS "edof"')
