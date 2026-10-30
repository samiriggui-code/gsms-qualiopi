"""Compte technique de l'assistant IA et jeton du serveur MCP.

L'assistant IA (moteur WeKnora) n'a pas d'utilisateur GSMS derrière chaque appel : tout le back-office partage
le compte de service WeKnora de l'organisme. Il lit donc le moteur Qualiopi au nom d'un **compte technique**
GSMS dont les droits sont explicites et visibles dans la gestion des comptes :

- rôle système `assistant_ia` = la seule permission `quality.read` (lecture de l'état Qualiopi) ;
- mot de passe aléatoire jamais communiqué : le compte ne peut pas se connecter à l'écran de connexion ;
- jeton « mcp » refusé par toutes les autres routes de l'API ;
- désactiver le compte coupe l'accès immédiatement ; `renew=True` change son mot de passe aléatoire,
  ce qui invalide l'ancien jeton.
"""

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.config import get_settings
from app.middleware.auth import create_mcp_token, forget_permissions, hash_password
from app.types.auth import User, UserRole

ROLE = "assistant_ia"
FULL_NAME = "Assistant IA (compte technique)"


def technical_account(db: Session, *, renew: bool = False) -> User:
    """Compte technique de l'assistant (créé au premier appel avec le seul rôle `assistant_ia`).

    Un compte existant garde ses rôles et son état : s'il a été désactivé ou modifié par un
    administrateur, ce choix est respecté."""
    email = get_settings().ia_compte_technique_email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, full_name=FULL_NAME, password_hash=hash_password(secrets.token_urlsafe(32)),
                    created_by="assistant-ia")
        user.role_links.append(UserRole(role=ROLE, created_by="assistant-ia"))
        db.add(user)
        db.flush()
        forget_permissions(db)
    elif renew:
        user.password_hash = hash_password(secrets.token_urlsafe(32))
        db.flush()
    return user


def mcp_token(db: Session, *, renew: bool = False) -> str:
    """Jeton que le moteur IA présente au serveur MCP (`Authorization: Bearer …`)."""
    return create_mcp_token(technical_account(db, renew=renew))
