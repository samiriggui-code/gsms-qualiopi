"""identité et coordonnées du stagiaire (mêmes notions que la préinscription), téléphone du personnel

Civilité, nom d'usage, naissance (date, ville, département, pays), nationalité, adresse, code postal, ville,
situation actuelle. Données personnelles : rendues par le seul détail du stagiaire, masquées dans le journal.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-26 21:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0026'
down_revision: Union[str, None] = '0025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ('civility', sa.String(length=5)), ('usage_name', sa.String(length=100)), ('birth_date', sa.Date()),
    ('birth_city', sa.String(length=120)), ('birth_department', sa.String(length=60)),
    ('birth_country', sa.String(length=80)), ('nationality', sa.String(length=80)), ('address', sa.String(length=300)),
    ('postal_code', sa.String(length=10)), ('city', sa.String(length=120)), ('current_situation', sa.String(length=300)),
)


def upgrade() -> None:
    for name, kind in COLUMNS:
        op.add_column('learner', sa.Column(name, kind, nullable=True), schema='formation')
    op.add_column('staff_member', sa.Column('phone', sa.String(length=40), nullable=True), schema='rh')


def downgrade() -> None:
    op.drop_column('staff_member', 'phone', schema='rh')
    for name, _ in reversed(COLUMNS):
        op.drop_column('learner', name, schema='formation')
