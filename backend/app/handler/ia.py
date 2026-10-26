"""API Moteur IA : session WeKnora du back-office (une seule connexion) et analyse d'un indicateur (contrat versionné)."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.application.service.ia.analyse import MAX_PASSAGES, MAX_QUESTION, analyse_indicator
from app.application.service.ia.compte import technical_account
from app.application.service.ia.espace import ensure_mcp_service
from app.application.service.ia.session import IAUnavailable, open_session
from app.middleware.auth import DB, _refusal, permissions_of, require
from app.types.auth import User
from app.types.ia import IAAnalysis

router = APIRouter(prefix="/api/v1/ia", tags=["ia"])
log = logging.getLogger(__name__)


IAUser = Annotated[User, Depends(require("ia.use"))]
JournalReader = Annotated[User, Depends(require("journal.read"))]


@router.post("/session")
def ia_session(user: IAUser, db: DB) -> dict:
    """Réponse de connexion WeKnora du compte navigateur (jeton, utilisateur, espace), sans jeton de renouvellement.

    Le front rappelle cette route pour prolonger la session : le compte GSMS est ainsi revérifié (actif, `ia.use`).
    Au passage, le serveur MCP du moteur Qualiopi est déclaré dans l'espace s'il ne l'est pas (idempotent).
    Un échec de cette déclaration n'empêche jamais la session : il est rendu dans `gsms_mcp`.

    Les assistants lisent le moteur avec le compte technique, pas avec le compte de la personne : la session est
    refusée à qui n'a pas toutes ses permissions (rôle personnalisé avec `ia.use` sans `quality.read`, par
    exemple), sinon l'assistant lui montrerait ce que GSMS lui interdit."""
    missing = sorted(permissions_of(db, technical_account(db)) - permissions_of(db, user))
    db.commit()  # compte technique créé au premier appel
    if missing:
        raise HTTPException(status_code=403, detail=(
            "L'assistant IA lit le moteur Qualiopi avec les droits " + ", ".join(missing) + " : votre compte ne les a "
            "pas, l'assistant vous montrerait des données qui vous sont fermées. À demander à un administrateur."))
    try:
        session = open_session()
    except IAUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    body = dict(session.browser)
    try:
        body["gsms_mcp"] = ensure_mcp_service(db, session.service_token).view()
    except Exception as e:  # noqa: BLE001 (la session reste utilisable sans les outils Qualiopi)
        db.rollback()
        log.warning("Déclaration du serveur MCP impossible : %s", e)
        body["gsms_mcp"] = {"ok": False, "fait": [], "a_regler": [f"Serveur MCP non déclaré : {e}"]}
    return body


class AnalyseIn(BaseModel):
    """Demande d'analyse : l'organisme, la version du référentiel et les documents autorisés sont fixés par le serveur."""

    model_config = ConfigDict(extra="forbid")
    indicateur: int = Field(ge=1, le=99)
    question: str | None = Field(default=None, max_length=MAX_QUESTION)
    max_passages: int = Field(default=5, ge=1, le=MAX_PASSAGES)


@router.post("/analyses")
def ia_analyse(body: AnalyseIn, user: IAUser, db: DB) -> dict:
    """Analyse d'un indicateur (contrat `gsms.ia.analyse-indicateur/1`) : état du moteur Qualiopi tel quel, textes
    officiels retrouvés par le moteur IA avec leurs références, ce qui n'a pas été fait, trace enregistrée.
    Demande aussi `quality.read` : l'état de l'indicateur est lu avec les droits de la personne."""
    if "quality.read" not in permissions_of(db, user):
        raise _refusal(db, user, ("quality.read",))
    return analyse_indicator(db, user, body.indicateur, body.question, body.max_passages)


@router.get("/analyses")
def ia_analyses(_: JournalReader, db: DB, indicateur: int | None = None, limite: int = 50) -> list[dict]:
    """Traces des analyses, les plus récentes d'abord (sans question ni texte de document)."""
    q = select(IAAnalysis).order_by(IAAnalysis.created_at.desc()).limit(max(1, min(limite, 200)))
    if indicateur is not None:
        q = q.where(IAAnalysis.indicator_number == indicateur)
    return [{"correlation_id": a.id, "contrat": a.contract, "utilisateur_id": a.user_id, "indicateur": a.indicator_number,
             "referentiel": a.referential_version, "etat_moteur": a.engine_status, "statut_recherche": a.reference_status,
             "documents_consultes": a.consulted_documents, "passages": a.chunk_ids, "passages_rejetes": a.rejected_references,
             "modele_embedding": a.embedding_model, "erreur": a.error, "duree_ms": a.duration_ms,
             "validation_humaine": a.validation_status, "cree_le": a.created_at.isoformat()} for a in db.scalars(q)]
