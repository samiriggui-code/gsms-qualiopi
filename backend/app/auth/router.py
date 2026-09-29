"""Connexion, comptes et rôles.

Les rôles appartiennent à l'organisme : il attribue les rôles système ou crée ses propres rôles
en cochant des permissions du catalogue. Règle unique contre l'escalade de droits : on ne donne
jamais une permission qu'on n'a pas soi-même, et on ne modifie ni son propre compte ni un compte
plus puissant que le sien.
"""

import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.models import CustomRole, User, UserRole
from app.auth.permissions import CATALOGUE, SYSTEM_ROLES, check_codes
from app.auth.security import (
    DB,
    CurrentUser,
    UserManager,
    create_token,
    forget_permissions,
    granted_permissions,
    hash_password,
    permissions_of,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    roles: list[str]
    is_active: bool = True

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DB) -> TokenOut:
    user = db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants invalides")
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me")
def me(user: CurrentUser, db: DB) -> dict:
    return UserOut.model_validate(user).model_dump() | {"permissions": sorted(permissions_of(db, user))}


# ── Rôles ────────────────────────────────────────────────────────────────────────


def role_permissions(db, code: str) -> frozenset[str]:  # noqa: ANN001
    if code in SYSTEM_ROLES:
        return SYSTEM_ROLES[code][1]
    role = db.scalar(select(CustomRole).where(CustomRole.code == code))
    if role is None:
        raise HTTPException(422, f"Rôle inconnu : {code}")
    return frozenset(role.permissions)


def _no_escalation(db, actor: User, permissions: frozenset[str] | set[str]) -> None:  # noqa: ANN001
    missing = set(permissions) - granted_permissions(db, actor)
    if missing:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Vous ne pouvez pas donner des droits que vous n'avez pas : {', '.join(sorted(missing))}")


@router.get("/permissions")
def list_permissions(_: CurrentUser) -> list[dict]:
    """Catalogue des permissions (défini par le code)."""
    return [{"code": p.code, "label": p.label, "feature": p.feature} for p in CATALOGUE]


@router.get("/roles")
def list_roles(db: DB, _: CurrentUser) -> list[dict]:
    """Rôles système proposés, puis rôles créés par l'organisme."""
    out = [{"code": c, "label": label, "system": True, "permissions": sorted(perms)} for c, (label, perms) in SYSTEM_ROLES.items()]
    out += [{"code": r.code, "label": r.label, "description": r.description, "system": False, "permissions": sorted(r.permissions)}
            for r in db.scalars(select(CustomRole).order_by(CustomRole.label))]
    return out


class RoleIn(BaseModel):
    code: str
    label: str
    description: str | None = None
    permissions: list[str]


@router.post("/roles", status_code=201)
def create_role(body: RoleIn, db: DB, actor: UserManager) -> dict:
    if not re.fullmatch(r"[a-z][a-z0-9_]{2,39}", body.code):
        raise HTTPException(422, "Code de rôle : minuscules, chiffres et _ (3 à 40 caractères)")
    if body.code in SYSTEM_ROLES or db.scalar(select(CustomRole).where(CustomRole.code == body.code)):
        raise HTTPException(409, f"Le rôle {body.code} existe déjà")
    perms = set(body.permissions)
    check_codes(perms)
    _no_escalation(db, actor, perms)
    db.add(CustomRole(code=body.code, label=body.label, description=body.description, permissions=sorted(perms)))
    db.commit()
    return {"code": body.code, "permissions": sorted(perms)}


class RoleUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    permissions: list[str] | None = None


@router.put("/roles/{code}")
def update_role(code: str, body: RoleUpdate, db: DB, actor: UserManager) -> dict:
    if code in SYSTEM_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Un rôle système ne se modifie pas : créez un rôle personnalisé")
    role = db.scalar(select(CustomRole).where(CustomRole.code == code))
    if role is None:
        raise HTTPException(404, "Rôle introuvable")
    _no_escalation(db, actor, set(role.permissions))
    if body.permissions is not None:
        perms = set(body.permissions)
        check_codes(perms)
        _no_escalation(db, actor, perms)
        role.permissions = sorted(perms)
    if body.label is not None:
        role.label = body.label
    if body.description is not None:
        role.description = body.description
    db.commit()
    forget_permissions(db)
    return {"code": role.code, "permissions": role.permissions}


@router.delete("/roles/{code}", status_code=204)
def delete_role(code: str, db: DB, actor: UserManager) -> None:
    role = db.scalar(select(CustomRole).where(CustomRole.code == code))
    if role is None:
        raise HTTPException(404, "Rôle introuvable")
    if db.scalar(select(UserRole).where(UserRole.role == code).limit(1)):
        raise HTTPException(409, "Rôle encore attribué : retirez-le d'abord des comptes")
    _no_escalation(db, actor, set(role.permissions))
    db.delete(role)
    db.commit()


# ── Comptes ──────────────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[UserOut])
def list_users(db: DB, _: UserManager) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)))


def _guard_target(db, actor: User, target: User) -> None:  # noqa: ANN001
    if target.id == actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vous ne pouvez pas modifier votre propre compte")
    _no_escalation(db, actor, granted_permissions(db, target))


def _set_roles(db, actor: User, user: User, roles: list[str]) -> None:  # noqa: ANN001
    wanted = set(roles)
    for code in wanted:
        _no_escalation(db, actor, role_permissions(db, code))
    user.role_links = [link for link in user.role_links if link.role in wanted]
    have = {link.role for link in user.role_links}
    user.role_links += [UserRole(role=code) for code in sorted(wanted - have)]
    forget_permissions(db)


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    roles: list[str] = ["lecture"]


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, db: DB, actor: UserManager) -> User:
    if len(body.password) < 12:
        raise HTTPException(422, "Mot de passe : 12 caractères minimum")
    if db.scalar(select(User).where(User.email == body.email.lower().strip())):
        raise HTTPException(409, "Email déjà utilisé")
    user = User(email=body.email.lower().strip(), full_name=body.full_name, password_hash=hash_password(body.password))
    _set_roles(db, actor, user, body.roles)
    db.add(user)
    db.commit()
    return user


class RolesIn(BaseModel):
    roles: list[str]


@router.put("/users/{user_id}/roles", response_model=UserOut)
def set_user_roles(user_id: str, body: RolesIn, db: DB, actor: UserManager) -> User:
    """Attribuer les rôles d'un membre de l'équipe (remplace la liste)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable")
    _guard_target(db, actor, user)
    _set_roles(db, actor, user, body.roles)
    db.commit()
    return user


class ActiveIn(BaseModel):
    is_active: bool


@router.put("/users/{user_id}/active", response_model=UserOut)
def set_user_active(user_id: str, body: ActiveIn, db: DB, actor: UserManager) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable")
    _guard_target(db, actor, user)
    user.is_active = body.is_active
    db.commit()
    return user
