"""Point d'entrée de l'API : `uvicorn app.main:app`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.db import get_engine
from app.core.errors import install_error_handlers
from app.core.journal_api import router as journal_router
from app.documents.router import router as documents_router
from app.platform.router import router as platform_router
from app.qualiopi.router import router as qualiopi_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="GSMS Qualiopi",
        version="0.1.0",
        docs_url=None if settings.app_env == "production" else "/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    install_error_handlers(app)
    app.include_router(auth_router)
    app.include_router(qualiopi_router)
    app.include_router(journal_router)
    app.include_router(documents_router)
    app.include_router(platform_router)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        with get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
