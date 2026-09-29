from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.models import ROLES, User
from app.auth.security import DB, PERMISSIONS, CurrentUser, create_token, hash_password, require, verify_password
from fastapi import Depends

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str

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


@router.post("/users", response_model=UserOut, dependencies=[Depends(require("manage_users"))])
def create_user(body: UserCreate, db: DB) -> User:
    if body.role not in ROLES:
        raise HTTPException(422, f"Rôle inconnu, valeurs possibles : {', '.join(ROLES)}")
    if len(body.password) < 10:
        raise HTTPException(422, "Mot de passe : 10 caractères minimum")
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email déjà utilisé")
    user = User(email=body.email.lower().strip(), full_name=body.full_name, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    return user


# --- Administration des comptes ---

ROLE_LABELS = {"admin": "Administrateur", "qualite": "Responsable qualité", "gestion": "Gestion", "lecture": "Lecture seule"}
PERMISSION_LABELS = {
    "read": "Consulter les données",
    "write_training": "Gérer formations, sessions et apprenants",
    "write_quality": "Gérer la qualité (veille, réclamations, enquêtes…)",
    "validate_evidence": "Valider ou rejeter les preuves",
    "manage_referential": "Gérer le référentiel Qualiopi",
    "manage_users": "Gérer les utilisateurs",
}


class UserAdminOut(UserOut):
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


@router.get("/permissions")
def permissions_matrix(_: CurrentUser) -> dict:
    """Matrice rôles × permissions, telle qu'appliquée côté serveur."""
    return {
        "roles": [{"key": r, "label": ROLE_LABELS[r]} for r in ROLES],
        "permissions": [{"key": p, "label": label} for p, label in PERMISSION_LABELS.items()],
        "grants": {role: sorted(perms) for role, perms in PERMISSIONS.items()},
    }


@router.get("/users", response_model=list[UserAdminOut], dependencies=[Depends(require("manage_users"))])
def list_users(db: DB) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)).all())


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def update_user(user_id: str, body: UserUpdate, db: DB, admin: User = Depends(require("manage_users"))) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable")
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(422, f"Rôle inconnu, valeurs possibles : {', '.join(ROLES)}")
        if user.id == admin.id and body.role != "admin":
            raise HTTPException(422, "Vous ne pouvez pas retirer votre propre rôle administrateur")
        user.role = body.role
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(422, "Vous ne pouvez pas désactiver votre propre compte")
        user.is_active = body.is_active
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.password:
        if len(body.password) < 10:
            raise HTTPException(422, "Mot de passe : 10 caractères minimum")
        user.password_hash = hash_password(body.password)
    db.commit()
    return user


# --- Compte de l'utilisateur connecté ---


class ProfileUpdate(BaseModel):
    full_name: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, db: DB, user: CurrentUser) -> User:
    if not body.full_name.strip():
        raise HTTPException(422, "Le nom est obligatoire")
    user.full_name = body.full_name.strip()
    db.commit()
    return user


@router.post("/me/password", status_code=204)
def change_password(body: PasswordChange, db: DB, user: CurrentUser) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(422, "Mot de passe actuel incorrect")
    if len(body.new_password) < 10:
        raise HTTPException(422, "Mot de passe : 10 caractères minimum")
    user.password_hash = hash_password(body.new_password)
    db.commit()
