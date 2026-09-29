"""Authentification JWT + contrôle de rôle côté serveur."""

from datetime import timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.config import get_settings
from app.core.db import get_db, utcnow

_bearer = HTTPBearer(auto_error=False)

# Qui peut faire quoi. Le front ne fait que refléter ces règles.
PERMISSIONS: dict[str, set[str]] = {
    "admin": {"read", "write_training", "write_quality", "validate_evidence", "manage_referential", "manage_users"},
    "qualite": {"read", "write_quality", "validate_evidence", "manage_referential"},
    "gestion": {"read", "write_training"},
    "lecture": {"read"},
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    s = get_settings()
    payload = {
        "sub": user.id,
        "role": user.role,
        "exp": utcnow() + timedelta(minutes=s.jwt_ttl_minutes),
    }
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
    return user


def require(permission: str):
    def _dep(user: Annotated[User, Depends(current_user)]) -> User:
        if permission not in PERMISSIONS.get(user.role, set()):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission « {permission} » requise")
        return user

    return _dep


CurrentUser = Annotated[User, Depends(current_user)]
Reader = Annotated[User, Depends(require("read"))]
TrainingWriter = Annotated[User, Depends(require("write_training"))]
QualityWriter = Annotated[User, Depends(require("write_quality"))]
EvidenceValidator = Annotated[User, Depends(require("validate_evidence"))]
ReferentialManager = Annotated[User, Depends(require("manage_referential"))]
DB = Annotated[Session, Depends(get_db)]
