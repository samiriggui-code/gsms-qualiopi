from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.auth.models import User
from app.auth.router import router as auth_router
from app.auth.security import hash_password
from app.core.config import get_settings
from app.core.db import session_factory
from app.core.errors import install_error_handlers
from app.qualiopi.referential.importer import import_referential
from app.qualiopi.referential.models import ReferentialVersion
from app.qualiopi.referential.router import router as referential_router
from app.training.router import router as training_router


def ensure_admin() -> None:
    """Crée le compte admin initial (ADMIN_EMAIL / ADMIN_PASSWORD) si aucun utilisateur n'existe."""
    s = get_settings()
    with session_factory()() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return
        db.add(
            User(
                email=s.admin_email.lower().strip(),
                full_name="Administrateur",
                password_hash=hash_password(s.admin_password),
                role="admin",
            )
        )
        db.commit()


def ensure_referential() -> None:
    """Importe et active le référentiel Qualiopi V9 livré si aucune version n'est active."""
    with session_factory()() as db:
        if db.scalar(select(ReferentialVersion.id).where(ReferentialVersion.is_active.is_(True)).limit(1)):
            return
        import_referential(db, get_settings().referentials_dir / "qualiopi" / "v9")
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    ensure_admin()
    ensure_referential()
    yield


app = FastAPI(title="GSMS Qualiopi", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
install_error_handlers(app)

app.include_router(auth_router)
app.include_router(referential_router)
app.include_router(training_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
