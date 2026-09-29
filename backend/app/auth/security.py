"""Authentification JWT + contrôle de rôle côté serveur."""

from datetime import timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import CustomRole, User
from app.auth.permissions import CATALOGUE, CODES, SYSTEM_ROLES
from app.core.config import get_settings
from app.core.db import get_db, utcnow
from app.core.journal import set_actor
from app.platform.features import enabled_features

FEATURE_OF = {p.code: p.feature for p in CATALOGUE}

_bearer = HTTPBearer(auto_error=False)


def permissions_of(db: Session, user: User) -> frozenset[str]:
    """Permissions d'un compte : union de ses rôles (système ou personnalisés). Mise en cache sur la session."""
    cache: dict = db.info.setdefault("permissions", {})
    if user.id not in cache:
        perms: set[str] = set()
        custom = [r for r in user.roles if r not in SYSTEM_ROLES]
        for r in user.roles:
            if r in SYSTEM_ROLES:
                perms |= SYSTEM_ROLES[r][1]
        if custom:
            for role in db.scalars(select(CustomRole).where(CustomRole.code.in_(custom))):
                perms |= set(role.permissions) & CODES
        # Une fonctionnalité désactivée retire ses permissions à tout le monde.
        on = enabled_features(db)
        cache[user.id] = frozenset(p for p in perms if FEATURE_OF[p] in on)
    return cache[user.id]


def forget_permissions(db: Session) -> None:
    db.info.pop("permissions", None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    s = get_settings()
    payload = {"sub": user.id, "exp": utcnow() + timedelta(minutes=s.jwt_ttl_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    try:
        payload = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide ou expiré") from None
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Utilisateur inactif")
    set_actor(db, f"{user.full_name} <{user.email}>")
    return user


def require(permission: str):
    if permission not in CODES:
        raise ValueError(f"permission inconnue du catalogue : {permission}")

    def _dep(user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]) -> User:
        if permission not in permissions_of(db, user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission « {permission} » requise")
        return user

    return _dep


CurrentUser = Annotated[User, Depends(current_user)]
DB = Annotated[Session, Depends(get_db)]
SessionsReader = Annotated[User, Depends(require("sessions.read"))]
SessionsWriter = Annotated[User, Depends(require("sessions.write"))]
AttendanceWriter = Annotated[User, Depends(require("attendance.write"))]
QualityReader = Annotated[User, Depends(require("quality.read"))]
QualityWriter = Annotated[User, Depends(require("quality.write"))]
EvidenceValidator = Annotated[User, Depends(require("evidence.validate"))]
ReferentialManager = Annotated[User, Depends(require("referential.manage"))]
JournalReader = Annotated[User, Depends(require("journal.read"))]
UserManager = Annotated[User, Depends(require("users.manage"))]
SettingsManager = Annotated[User, Depends(require("settings.manage"))]
