"""API Moteur IA : session WeKnora du back-office (une seule connexion) et analyse d'un indicateur (contrat versionné)."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.application.service.ia import voix
from app.application.service.ia.analyse import MAX_PASSAGES, MAX_QUESTION, analyse_indicator
from app.application.service.ia.espace import ensure_mcp_service
from app.application.service.ia.session import IAUnavailable, open_session
from app.database.db import utcnow
from app.middleware.auth import DB, _refusal, permissions_of, require
from app.types.auth import User
from app.types.ia import PROPOSAL_STATUSES, IAAccount, IAAnalysis, IAProposal

router = APIRouter(prefix="/api/v1/ia", tags=["ia"])
log = logging.getLogger(__name__)


IAUser = Annotated[User, Depends(require("ia.use"))]
JournalReader = Annotated[User, Depends(require("journal.read"))]


@router.post("/session")
def ia_session(user: IAUser, db: DB) -> dict:
    """Réponse de connexion du compte WeKnora propre à ce compte GSMS (jeton, utilisateur, espace), sans jeton de
    renouvellement.

    Le front rappelle cette route pour prolonger la session : le compte GSMS est ainsi revérifié (actif, `ia.use`).
    Au passage, le serveur MCP du moteur Qualiopi est déclaré dans l'espace s'il ne l'est pas (idempotent).
    Un échec de cette déclaration n'empêche jamais la session : il est rendu dans `gsms_mcp`.

    Le compte WeKnora de la personne est noté (`iam.compte_ia`) : quand un assistant appelle le serveur MCP pour elle,
    chaque outil répond avec ses droits à elle, croisés avec ceux du compte technique (voir `mcp.py`). L'assistant ne
    lui montre donc jamais ce que GSMS lui ferme."""
    try:
        session = open_session(user.id, user.full_name)
    except IAUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    body = dict(session.browser)
    weknora_id = str((body.get("user") or {}).get("id") or "")
    if weknora_id:
        account = db.get(IAAccount, weknora_id)
        if account is None:
            db.add(IAAccount(weknora_user_id=weknora_id, user_id=user.id))
        elif account.user_id != user.id:
            account.user_id = user.id
        db.commit()
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
    analyse_ia: bool = False


@router.post("/analyses")
def ia_analyse(body: AnalyseIn, user: IAUser, db: DB) -> dict:
    """Analyse d'un indicateur (contrat `gsms.ia.analyse-indicateur/2`) : état du moteur Qualiopi tel quel, passages
    retrouvés par le moteur IA avec leurs références, et sur demande (`analyse_ia`) observations et propositions du
    modèle validées par GSMS ; ce qui n'a pas été fait ; trace enregistrée.
    Demande aussi `quality.read` : l'état de l'indicateur est lu avec les droits de la personne."""
    if "quality.read" not in permissions_of(db, user):
        raise _refusal(db, user, ("quality.read",))
    return analyse_indicator(db, user, body.indicateur, body.question, body.max_passages, body.analyse_ia)


@router.get("/analyses")
def ia_analyses(_: JournalReader, db: DB, indicateur: int | None = None, limite: int = 50) -> list[dict]:
    """Traces des analyses, les plus récentes d'abord (sans question ni texte de document)."""
    q = select(IAAnalysis).order_by(IAAnalysis.created_at.desc()).limit(max(1, min(limite, 200)))
    if indicateur is not None:
        q = q.where(IAAnalysis.indicator_number == indicateur)
    return [{"correlation_id": a.id, "contrat": a.contract, "utilisateur_id": a.user_id, "indicateur": a.indicator_number,
             "referentiel": a.referential_version, "etat_moteur": a.engine_status, "statut_recherche": a.reference_status,
             "documents_consultes": a.consulted_documents, "passages": a.chunk_ids, "passages_rejetes": a.rejected_references,
             "modele_embedding": a.embedding_model, "modele_generation": a.generation_model,
             "observations_gardees": a.observations_kept, "observations_rejetees": a.observations_rejected,
             "erreur": a.error, "duree_ms": a.duration_ms,
             "validation_humaine": a.validation_status, "cree_le": a.created_at.isoformat()} for a in db.scalars(q)]


QualityReader = Annotated[User, Depends(require("quality.read"))]
QualityWriter = Annotated[User, Depends(require("quality.write"))]


def _proposal_view(p: IAProposal) -> dict:
    return {"id": p.id, "correlation_id": p.analysis_id, "indicateur": p.indicator_number, "action": p.action,
            "justification": p.justification, "passages": p.passages, "statut": p.status,
            "decide_par": p.decided_by, "decide_le": p.decided_at.isoformat() if p.decided_at else None,
            "motif": p.decision_note, "cree_le": p.created_at.isoformat()}


@router.get("/propositions")
def ia_proposals(_: QualityReader, db: DB, statut: str | None = None, indicateur: int | None = None) -> list[dict]:
    """Propositions d'action de l'IA, les plus récentes d'abord (200 au plus)."""
    if statut is not None and statut not in PROPOSAL_STATUSES:
        raise HTTPException(422, f"Statut inconnu : {statut} (attendus : {', '.join(PROPOSAL_STATUSES)})")
    q = select(IAProposal).order_by(IAProposal.created_at.desc(), IAProposal.id).limit(200)
    if statut:
        q = q.where(IAProposal.status == statut)
    if indicateur is not None:
        q = q.where(IAProposal.indicator_number == indicateur)
    return [_proposal_view(p) for p in db.scalars(q)]


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["ACCEPTEE", "REJETEE"]
    motif: str | None = Field(default=None, max_length=1000)


@router.post("/propositions/{proposal_id}/decision")
def ia_proposal_decision(proposal_id: str, body: DecisionIn, user: QualityWriter, db: DB) -> dict:
    """Décision humaine sur une proposition de l'IA, définitive et tracée (qui, quand, pourquoi).

    Accepter n'applique rien de soi-même : l'action se crée ensuite dans GSMS par le circuit habituel."""
    proposal = db.get(IAProposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, "Proposition introuvable")
    if proposal.status != "PROPOSEE":
        raise HTTPException(409, f"Proposition déjà {proposal.status.lower()} : la décision ne se change pas")
    motif = (body.motif or "").strip() or None
    if body.decision == "REJETEE" and motif is None:
        raise HTTPException(422, "Indiquez le motif du rejet")
    proposal.status, proposal.decided_by, proposal.decided_at, proposal.decision_note = (
        body.decision, user.id, utcnow(), motif)
    pending = db.scalar(select(func.count()).select_from(IAProposal).where(
        IAProposal.analysis_id == proposal.analysis_id, IAProposal.status == "PROPOSEE", IAProposal.id != proposal.id))
    analysis = db.get(IAAnalysis, proposal.analysis_id)
    if analysis is not None and not pending:
        analysis.validation_status = "DECIDEE"
    db.commit()
    return _proposal_view(proposal)



# ── Voix du chat ──────────────────────────────────────────────────────────────────


@router.get("/voix")
def ia_voice_status(_: IAUser) -> dict:
    """La voix est-elle réglée (le front n'affiche le micro et la lecture que si oui), et ses limites."""
    return voix.status()


@router.post("/voix/transcription")
async def ia_voice_transcription(_: IAUser, file: Annotated[UploadFile, File()]) -> dict:
    """Texte d'une dictée (l'enregistrement n'est pas conservé). 422 pour un enregistrement refusé, 503 sinon."""
    audio = await file.read(voix.MAX_AUDIO + 1)
    try:
        return {"texte": voix.transcribe(audio, file.filename or "dictee.webm", file.content_type or "")}
    except voix.VoiceUnavailable as e:
        refused = len(audio) > voix.MAX_AUDIO or not audio or "Format audio" in str(e)
        raise HTTPException(status_code=422 if refused else 503, detail=str(e)) from e


class SpeechIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texte: str = Field(min_length=1, max_length=voix.MAX_TEXT)


@router.post("/voix/synthese")
def ia_voice_speech(body: SpeechIn, _: IAUser) -> Response:
    """Lecture à voix haute d'un texte (MP3 ; rien n'est conservé)."""
    try:
        audio, kind = voix.synthesize(body.texte)
    except voix.VoiceUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return Response(content=audio, media_type=kind, headers={"Cache-Control": "no-store"})
