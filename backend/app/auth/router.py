from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.models import ROLES, User
from app.auth.security import DB, CurrentUser, create_token, hash_password, require, verify_password
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
    if len(body.password) < 12:
        raise HTTPException(422, "Mot de passe : 12 caractères minimum")
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email déjà utilisé")
    user = User(email=body.email.lower().strip(), full_name=body.full_name, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    return user
