"""photos des personnes et vignettes des formations (chemins de la médiathèque)

Une seule source pour les images affichées : `photo_url` sur le stagiaire, le formateur et la fiche RH, `image_url`
sur la formation. Valeurs : chemins relatifs `media/…` ou `assets/…` (app.common.media), jamais une adresse externe.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-26 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0024'
down_revision: Union[str, None] = '0023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('learner', sa.Column('photo_url', sa.String(length=200), nullable=True), schema='formation')
    op.add_column('trainer', sa.Column('photo_url', sa.String(length=200), nullable=True), schema='formation')
    op.add_column('program', sa.Column('image_url', sa.String(length=200), nullable=True), schema='formation')
    op.add_column('staff_member', sa.Column('photo_url', sa.String(length=200), nullable=True), schema='rh')


def downgrade() -> None:
    op.drop_column('staff_member', 'photo_url', schema='rh')
    op.drop_column('program', 'image_url', schema='formation')
    op.drop_column('trainer', 'photo_url', schema='formation')
    op.drop_column('learner', 'photo_url', schema='formation')
