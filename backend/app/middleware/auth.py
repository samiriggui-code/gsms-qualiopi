"""Authentification JWT + contrôle de rôle côté serveur."""

import hashlib
from datetime import timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.platform.features import FEATURES, available, enabled_features
from app.common.journal import set_actor
from app.config.config import get_settings
from app.database.db import get_db, utcnow
from app.router.rbac import CATALOGUE, CODES, SYSTEM_ROLES
from app.types.auth import CustomRole, User

FEATURE_OF = {p.code: p.feature for p in CATALOGUE}

_bearer = HTTPBearer(auto_error=False)


def granted_permissions(db: Session, user: User) -> frozenset[str]:
    """Permissions accordées par les rôles, que leur module soit actif ou non (règle anti-escalade)."""
    perms: set[str] = set()
    custom = [r for r in user.roles if r not in SYSTEM_ROLES]
    for r in user.roles:
        if r in SYSTEM_ROLES:
            perms |= SYSTEM_ROLES[r][1]
    if custom:
        for role in db.scalars(select(CustomRole).where(CustomRole.code.in_(custom))):
            perms |= set(role.permissions) & CODES
    return frozenset(perms)


def permissions_of(db: Session, user: User) -> frozenset[str]:
    """Permissions d'un compte : union de ses rôles (système ou personnalisés). Mise en cache sur la session."""
    cache: dict = db.info.setdefault("permissions", {})
    if user.id not in cache:
        # Une fonctionnalité désactivée retire ses permissions à tout le monde.
        on = enabled_features(db)
        cache[user.id] = frozenset(p for p in granted_permissions(db, user) if FEATURE_OF[p] in on)
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
    """Jeton de connexion : compte, version de ses jetons (`ver`), date d'émission et d'expiration."""
    s = get_settings()
    now = utcnow()
    payload = {"sub": user.id, "ver": user.token_version, "iat": now, "exp": now + timedelta(minutes=s.jwt_ttl_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def revoke_tokens(user: User) -> None:
    """Révoque tous les jetons de connexion émis pour ce compte (effectif au commit, tracé au journal).

    Toute nouvelle valeur suffit : deux révocations simultanées révoquent toutes deux les jetons antérieurs.
    Le jeton « mcp » n'est pas concerné : il a sa propre liaison à l'empreinte du mot de passe."""
    user.token_version += 1


# Jeton « mcp » : réservé au serveur MCP (/api/v1/mcp), refusé partout ailleurs. Il ne périme pas, mais il est
# lié à l'empreinte du mot de passe (aléatoire) du compte technique : renouveler ce mot de passe l'invalide.
MCP_SCOPE = "mcp"


def _fingerprint(user: User) -> str:
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def create_mcp_token(user: User) -> str:
    payload = {"sub": user.id, "scope": MCP_SCOPE, "fp": _fingerprint(user)}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def user_from_token(db: Session, token: str, *, allow_mcp: bool = False) -> User:
    """Compte d'un jeton valide ; 401 sinon. Un jeton « mcp » n'est accepté que si `allow_mcp`."""
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide ou expiré") from None
    scope = payload.get("scope")
    if scope is not None and not (allow_mcp and scope == MCP_SCOPE):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton non valable pour cette route")
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Utilisateur inactif")
    if scope == MCP_SCOPE:
        if payload.get("fp") != _fingerprint(user):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton renouvelé depuis : l'ancien n'est plus valable")
    elif payload.get("ver") != user.token_version:
        # Mot de passe changé, compte désactivé ou « déconnexion partout » depuis l'émission du jeton.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session révoquée : reconnectez-vous")
    set_actor(db, f"{user.full_name} <{user.email}>")
    return user


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    return user_from_token(db, creds.credentials)


def _refusal(db: Session, user: User, permissions: tuple[str, ...]) -> HTTPException:
    """Refus lisible : si le rôle donne le droit mais que son module est éteint, on le dit (et où le rallumer)."""
    granted = granted_permissions(db, user)
    off = sorted({FEATURE_OF[p] for p in permissions if p in granted} - enabled_features(db))
    # Non construit ou hors abonnement : aucun réglage ne le rallume, on ne renvoie pas vers les Paramètres
    unavailable = [f for f in off if f not in FEATURES or not FEATURES[f].built or f not in available()]
    if unavailable:
        names = ", ".join(f"« {FEATURES[f].label if f in FEATURES else f} »" for f in unavailable)
        return HTTPException(status.HTTP_403_FORBIDDEN, f"Module {names} indisponible dans cette édition ou cet abonnement.")
    if off:
        names = ", ".join(f"« {FEATURES[f].label if f in FEATURES else f} »" for f in off)
        return HTTPException(status.HTTP_403_FORBIDDEN, f"Module {names} désactivé : un administrateur peut l'activer "
                                                        "dans Administration › Paramètres › Modules.")
    if len(permissions) == 1:
        return HTTPException(status.HTTP_403_FORBIDDEN, f"Permission « {permissions[0]} » requise")
    return HTTPException(status.HTTP_403_FORBIDDEN, f"Permission requise : {' ou '.join(permissions)}")


def require_any(*permissions: str):
    """Au moins une des permissions (ex. toutes les sessions OU ses propres sessions)."""
    unknown = set(permissions) - CODES
    if unknown:
        raise ValueError(f"permissions inconnues du catalogue : {unknown}")

    def _dep(user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]) -> User:
        if not set(permissions) & permissions_of(db, user):
            raise _refusal(db, user, permissions)
        return user

    return _dep


def require(permission: str):
    if permission not in CODES:
        raise ValueError(f"permission inconnue du catalogue : {permission}")

    def _dep(user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]) -> User:
        if permission not in permissions_of(db, user):
            raise _refusal(db, user, (permission,))
        return user

    return _dep


CurrentUser = Annotated[User, Depends(current_user)]
DB = Annotated[Session, Depends(get_db)]
SessionsReader = Annotated[User, Depends(require_any("sessions.read", "sessions.read_own"))]
AllSessionsReader = Annotated[User, Depends(require("sessions.read"))]
StaffReader = Annotated[User, Depends(require("staff.read"))]
FundingReader = Annotated[User, Depends(require("funding.read"))]
FundingWriter = Annotated[User, Depends(require("funding.write"))]
StaffWriter = Annotated[User, Depends(require("staff.write"))]
TrainersWriter = Annotated[User, Depends(require("trainers.write"))]
SessionsWriter = Annotated[User, Depends(require("sessions.write"))]
AttendanceWriter = Annotated[User, Depends(require("attendance.write"))]
QualityReader = Annotated[User, Depends(require("quality.read"))]
QualityWriter = Annotated[User, Depends(require("quality.write"))]
EvidenceValidator = Annotated[User, Depends(require("evidence.validate"))]
ReferentialManager = Annotated[User, Depends(require("referential.manage"))]
JournalReader = Annotated[User, Depends(require("journal.read"))]
UserManager = Annotated[User, Depends(require("users.manage"))]
SettingsManager = Annotated[User, Depends(require("settings.manage"))]
