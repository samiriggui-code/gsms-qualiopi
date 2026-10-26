"""Point d'entrée de l'API : `uvicorn app.cmd.server:app`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config.config import get_settings
from app.database.db import get_engine
from app.errors.errors import install_error_handlers
from app.handler.attendance import router as attendance_router
from app.handler.auth import router as auth_router
from app.handler.contact import router as contact_router
from app.handler.documents import router as documents_router
from app.handler.editions import router as editions_router
from app.handler.edof import router as edof_router
from app.handler.funding import router as funding_router
from app.handler.hr import router as hr_router
from app.handler.ia import router as ia_router
from app.handler.invoicing import router as invoicing_router
from app.handler.journal import router as journal_router
from app.handler.journey import router as journey_router
from app.handler.mcp import router as mcp_router
from app.handler.pilotage import router as pilotage_router
from app.handler.platform import router as platform_router
from app.handler.preinscriptions import public_router as preinscriptions_public_router
from app.handler.preinscriptions import router as preinscriptions_router
from app.handler.qualiopi import router as qualiopi_router
from app.handler.qualiopi_ecrans import router as qualiopi_screens_router
from app.handler.questionnaires import router as public_router
from app.handler.relances import router as relances_router
from app.handler.roadmap import router as roadmap_router
from app.handler.training import router as training_router
from app.handler.training_offre import router as offer_router
from app.handler.training_resources import ROUTERS as training_resources


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="GSMS Qualiopi",
        version="0.1.0",
        docs_url=None if settings.app_env == "production" else "/docs",
        openapi_url=None if settings.app_env == "production" else "/openapi.json",
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
    app.include_router(qualiopi_screens_router)
    app.include_router(journal_router)
    app.include_router(documents_router)
    app.include_router(edof_router)
    app.include_router(editions_router)
    app.include_router(invoicing_router)
    app.include_router(platform_router)
    app.include_router(roadmap_router)
    app.include_router(pilotage_router)
    app.include_router(training_router)
    app.include_router(offer_router)
    app.include_router(attendance_router)
    app.include_router(hr_router)
    app.include_router(ia_router)
    app.include_router(mcp_router)
    app.include_router(funding_router)
    app.include_router(journey_router)
    app.include_router(relances_router)
    app.include_router(public_router)
    app.include_router(preinscriptions_router)
    app.include_router(preinscriptions_public_router)
    app.include_router(contact_router)
    for resource_router in training_resources:
        app.include_router(resource_router)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        with get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
