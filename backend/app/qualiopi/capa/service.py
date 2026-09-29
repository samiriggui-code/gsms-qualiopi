"""Cycle CAPA : constat → action → réalisation → vérification d'efficacité → clôture."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import InvalidStateError, NotFoundError
from app.events.publish import publish
from app.qualiopi.capa.models import CapaAction, CapaEvent
from app.qualiopi.common import next_reference
from app.qualiopi.evaluation.models import Finding

TRANSITIONS = {
    "OUVERTE": {"EN_COURS", "ANNULEE"},
    "EN_COURS": {"A_VERIFIER", "ANNULEE"},
    "A_VERIFIER": {"EN_COURS", "CLOTUREE"},
    "CLOTUREE": set(),
    "ANNULEE": set(),
}


def create_capa(db: Session, finding_id: str, *, title: str, action_plan: str, owner_name: str, due_on: date,
                root_cause: str | None, kind: str, actor: str) -> CapaAction:
    f = db.get(Finding, finding_id)
    if f is None:
        raise NotFoundError("Constat introuvable")
    if f.status in ("RESOLU", "FAUX_POSITIF"):
        raise InvalidStateError(f"Constat au statut {f.status} : pas d'action corrective à ouvrir")
    capa = CapaAction(
        reference=next_reference(db, "CAPA"),
        finding_id=f.id,
        kind=kind,
        title=title,
        root_cause=root_cause,
        action_plan=action_plan,
        owner_name=owner_name,
        due_on=due_on,
        created_by=actor,
    )
    capa.events.append(CapaEvent(kind="CREATED", detail=f"depuis {f.reference}", actor=actor))
    f.status = "EN_TRAITEMENT"
    db.add(capa)
    db.flush()
    return capa


def _move(capa: CapaAction, to: str, actor: str, detail: str | None = None) -> None:
    if to not in TRANSITIONS[capa.status]:
        raise InvalidStateError(f"Transition {capa.status} → {to} interdite")
    capa.events.append(CapaEvent(kind=f"STATUS:{to}", detail=detail, actor=actor))
    capa.status = to


def start(db: Session, capa: CapaAction, actor: str) -> CapaAction:
    _move(capa, "EN_COURS", actor)
    return capa


def complete(db: Session, capa: CapaAction, note: str, actor: str) -> CapaAction:
    if not note.strip():
        raise InvalidStateError("Décrivez ce qui a été réalisé")
    if capa.status == "OUVERTE":
        _move(capa, "EN_COURS", actor)
    _move(capa, "A_VERIFIER", actor, note)
    capa.completion_note = note
    capa.completed_on = date.today()
    return capa


def verify(db: Session, capa: CapaAction, actor: str, human_note: str | None = None) -> CapaAction:
    """Vérification d'efficacité.

    Constat issu d'un contrôle : on demande au moteur de réévaluer le contrôle ; le worker
    clôt la CAPA seulement si l'écart a disparu (conclude_verification). Un humain ne peut pas
    clore à la place du moteur.
    Constat issu d'un audit : vérification humaine motivée, clôture immédiate.
    """
    if capa.status != "A_VERIFIER":
        raise InvalidStateError("La CAPA doit être au statut A_VERIFIER")
    f = db.get(Finding, capa.finding_id)
    if f is None:
        raise NotFoundError("Constat introuvable")
    if f.origin == "CONTROLE":
        capa.events.append(CapaEvent(kind="VERIFICATION_REQUESTED", detail=f"réévaluation de {f.control_key}", actor=actor))
        publish(
            db,
            "capa.verification_requested",
            "capa",
            capa.id,
            session_id=f.target_id if f.target_type == "SESSION" else None,
            program_id=f.target_id if f.target_type == "FORMATION" else None,
            actor_id=None,
            payload={"finding": f.reference, "actor": actor},
        )
        return capa
    if not (human_note or "").strip():
        raise InvalidStateError("Constat d'audit : une note de vérification humaine est obligatoire")
    f.status = "RESOLU"
    f.resolved_at = utcnow()
    _close(db, capa, f, actor, f"Vérifié par {actor} : {human_note}")
    return capa


def conclude_verification(db: Session, capa_id: str) -> CapaAction:
    """Appelé par le worker après la réévaluation. Idempotent."""
    capa = db.get(CapaAction, capa_id)
    if capa is None:
        raise NotFoundError("CAPA introuvable")
    if capa.status != "A_VERIFIER":
        return capa
    f = db.get(Finding, capa.finding_id)
    assert f is not None
    requested_by = next((e.actor for e in reversed(capa.events) if e.kind == "VERIFICATION_REQUESTED"), "moteur")
    if f.status != "RESOLU":
        capa.verification_result = f"Échec : le contrôle {f.control_key} signale toujours l'écart ({f.readiness}). {f.explanation}"
        _move(capa, "EN_COURS", "moteur", capa.verification_result)
        return capa
    _close(db, capa, f, requested_by, f"Efficace : le contrôle {f.control_key} ne signale plus d'écart.")
    return capa


def _close(db: Session, capa: CapaAction, f: Finding, actor: str, result: str) -> None:
    capa.verification_result = result
    capa.verified_at = utcnow()
    capa.verified_by = actor
    capa.closed_at = utcnow()
    _move(capa, "CLOTUREE", actor, result)
    publish(db, "capa.closed", "capa", capa.id, payload={"finding": f.reference})


def cancel(db: Session, capa: CapaAction, reason: str, actor: str) -> CapaAction:
    if not reason.strip():
        raise InvalidStateError("Motif d'annulation obligatoire")
    _move(capa, "ANNULEE", actor, reason)
    f = db.get(Finding, capa.finding_id)
    if f is not None and f.status == "EN_TRAITEMENT":
        f.status = "OUVERT"
    return capa
