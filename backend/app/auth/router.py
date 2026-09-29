from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.models import ROLES, User
from app.auth.security import DB, PERMISSIONS, ROLE_LABELS, CurrentUser, create_token, hash_password, require, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
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


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "lecture"


UserManager = Depends(require("manage_users"))


def _check_role_grant(actor: User, role: str) -> None:
    if role not in ROLES:
        raise HTTPException(422, f"Rôle inconnu, valeurs possibles : {', '.join(ROLES)}")
    if role == "admin" and actor.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul un administrateur peut nommer un administrateur")


@router.get("/roles")
def list_roles(_: CurrentUser) -> list[dict]:
    """Catalogue des rôles que l'organisme attribue à son personnel."""
    return [{"role": r, "label": ROLE_LABELS[r], "permissions": sorted(PERMISSIONS[r])} for r in ROLES]


@router.get("/users", response_model=list[UserOut])
def list_users(db: DB, _: User = UserManager) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)))


class UserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, db: DB, actor: User = UserManager) -> User:
    """Attribuer un rôle ou désactiver un compte. Personne ne modifie son propre compte."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable")
    if user.id == actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vous ne pouvez pas modifier votre propre rôle ou compte")
    if user.role == "admin" and actor.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul un administrateur peut modifier un administrateur")
    if body.role is not None:
        _check_role_grant(actor, body.role)
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    return user


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, db: DB, actor: User = UserManager) -> User:
    _check_role_grant(actor, body.role)
    if len(body.password) < 12:
        raise HTTPException(422, "Mot de passe : 12 caractères minimum")
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email déjà utilisé")
    user = User(email=body.email.lower().strip(), full_name=body.full_name, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    return user
