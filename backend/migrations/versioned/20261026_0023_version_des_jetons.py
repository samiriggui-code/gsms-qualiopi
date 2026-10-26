"""version des jetons de connexion par compte (révocation, constat d'audit F2)

Chaque jeton porte la version du compte ; l'incrémenter (mot de passe changé, compte désactivé, « déconnexion
partout ») révoque les jetons émis avant. Les comptes existants partent de 0 ; les jetons émis avant cette version,
qui ne portent pas de version, sont refusés : chacun se reconnecte une fois.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-26 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0023'
down_revision: Union[str, None] = '0022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False), schema='iam')


def downgrade() -> None:
    op.drop_column('user', 'token_version', schema='iam')
