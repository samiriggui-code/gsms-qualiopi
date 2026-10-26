"""Serveur MCP du moteur Qualiopi (transport « Streamable HTTP », sans état), pour l'assistant IA.

Implémentation JSON-RPC 2.0 minimale, sans SDK : `initialize`, `ping`, `tools/list`, `tools/call` et les
notifications. Le serveur ne pousse rien vers le client : pas de flux SSE (GET répond 405), pas de session
(aucun en-tête `Mcp-Session-Id`). Les réponses sont toujours du JSON simple.

Authentification : `Authorization: Bearer <jeton>`, obligatoire à chaque requête.
- jeton « mcp » du compte technique de l'assistant (voir `app/application/service/ia/compte.py`), que le
  moteur IA présente en appel direct sur le réseau interne ; ce jeton n'ouvre aucune autre route de l'API et
  il est refusé s'il arrive par un proxy (en-têtes X-Forwarded-For / Forwarded) ;
- ou jeton de connexion ordinaire d'un utilisateur GSMS (client MCP personnel) : ses propres droits.
Chaque outil exige la permission de la route HTTP qu'il reprend ; un module éteint ou un droit manquant donne
un résultat d'outil en erreur avec le motif lisible.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.config.config import get_settings
from app.database.db import get_db
from app.errors.errors import DomainError
from app.handler.mcp_outils import BY_NAME, TOOLS
from app.middleware.auth import _refusal, permissions_of, user_from_token
from app.types.auth import User

router = APIRouter(prefix="/api/v1", tags=["mcp"])

SERVER_NAME = "gsms-qualiopi"
SERVER_VERSION = "1.0.0"
# Versions du protocole comprises ; on reprend celle du client si on la connaît, sinon la plus récente.
PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
MAX_TEXT = 120_000  # caractères renvoyés par un outil, au-delà on tronque en le disant

INSTRUCTIONS = (
    "Outils en lecture seule du moteur Qualiopi de GSMS (organisme de formation). Ils donnent l'état de "
    "préparation calculé à partir des preuves disponibles, les preuves, les écarts, les échéances, les actions "
    "correctives et la synthèse d'une session. Le moteur ne prononce jamais la conformité : seul l'organisme "
    "certificateur en décide ; ne présentez jamais un état « démontrable » comme une conformité acquise. "
    "Distinguez ce que le référentiel exige (des preuves) de ce qui est recommandé (délais, relances)."
)

PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS = -32700, -32600, -32601, -32602


def mcp_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    """Authentification de chaque requête MCP (jeton « mcp » ou jeton utilisateur)."""
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in get_settings().cors_origin_list:
        # Protection contre le « DNS rebinding » demandée par la spécification MCP.
        raise HTTPException(403, "Origine non autorisée")
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Authentification requise", headers={"WWW-Authenticate": "Bearer"})
    # Le jeton « mcp » ne sert qu'aux appels directs du moteur IA sur le réseau interne (http://api:8000). Une requête
    # passée par le proxy public (Caddy, Traefik, serveur de dev) porte X-Forwarded-For / Forwarded : elle n'est
    # acceptée qu'avec un jeton utilisateur. Un jeton « mcp » détourné reste ainsi inutilisable depuis l'extérieur.
    internal = not (request.headers.get("x-forwarded-for") or request.headers.get("forwarded"))
    try:
        return user_from_token(db, token.strip(), allow_mcp=internal)
    except HTTPException as e:
        raise HTTPException(401, e.detail, headers={"WWW-Authenticate": "Bearer"}) from None


def _error(rid: object, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


def _result(rid: object, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _text_result(payload: object, *, is_error: bool = False) -> dict:
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, default=str)
    if len(text) > MAX_TEXT:
        text = text[:MAX_TEXT] + "\n[… réponse tronquée : précisez un filtre ou une limite plus petite]"
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


def _call_tool(db: Session, user: User, params: dict) -> dict:
    name = params.get("name")
    tool = BY_NAME.get(name) if isinstance(name, str) else None
    if tool is None:
        return _text_result(f"Outil inconnu : {name}", is_error=True)
    args = params.get("arguments") or {}
    if not isinstance(args, dict):
        return _text_result("Les arguments doivent être un objet", is_error=True)
    if not set(tool.permissions) & permissions_of(db, user):  # l'une des permissions de la route suffit
        return _text_result(_refusal(db, user, tool.permissions).detail, is_error=True)
    try:
        return _text_result(tool.run(db, user, args))
    except DomainError as e:
        return _text_result(e.message, is_error=True)
    finally:
        db.rollback()  # lecture seule : rien n'est jamais enregistré par un outil


def _handle(db: Session, user: User, message: object) -> dict | None:
    """Une requête JSON-RPC → sa réponse (None pour une notification)."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
        return _error(message.get("id") if isinstance(message, dict) else None, INVALID_REQUEST, "Requête JSON-RPC invalide")
    method, rid = message["method"], message.get("id")
    if "id" not in message:
        return None  # notification (notifications/initialized, notifications/cancelled…) : rien à répondre
    params = message.get("params") or {}
    if not isinstance(params, dict):
        return _error(rid, INVALID_PARAMS, "Paramètres invalides")
    if method == "initialize":
        asked = params.get("protocolVersion")
        return _result(rid, {
            "protocolVersion": asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "title": "Moteur Qualiopi GSMS", "version": SERVER_VERSION},
            "instructions": INSTRUCTIONS,
        })
    if method == "ping":
        return _result(rid, {})
    if method == "tools/list":
        return _result(rid, {"tools": [tool.descriptor() for tool in TOOLS]})
    if method == "tools/call":
        return _result(rid, _call_tool(db, user, params))
    # Dont « server/discover » : le client retombe alors sur la poignée de main `initialize`.
    return _error(rid, METHOD_NOT_FOUND, f"Méthode non prise en charge : {method}")


@router.post("/mcp")
async def mcp_endpoint(request: Request, user: Annotated[User, Depends(mcp_user)],
                       db: Annotated[Session, Depends(get_db)]) -> Response:
    try:
        message = json.loads(await request.body() or b"null")
    except ValueError:
        return JSONResponse(_error(None, PARSE_ERROR, "JSON illisible"), status_code=400)
    # La base est lue en dehors de la boucle d'événements.
    if isinstance(message, list):  # lot JSON-RPC (anciennes versions du protocole)
        replies = [r for r in [await run_in_threadpool(_handle, db, user, m) for m in message] if r is not None]
        return JSONResponse(replies) if replies else Response(status_code=202)
    reply = await run_in_threadpool(_handle, db, user, message)
    return JSONResponse(reply) if reply is not None else Response(status_code=202)


@router.get("/mcp")
@router.delete("/mcp")
def mcp_no_stream() -> Response:
    """Pas de flux serveur ni de session à fermer : 405, comme le prévoit le transport Streamable HTTP."""
    return Response(status_code=405, headers={"Allow": "POST"})
