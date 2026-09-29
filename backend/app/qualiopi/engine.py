"""Façade du moteur : événements métier → preuves → réévaluation ciblée."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.events.models import OutboxEvent
from app.qualiopi.evaluation.service import evaluate
from app.qualiopi.evidence.service import reconcile
from app.qualiopi.referential.importer import active_version
from app.training import models as t

# Événements qui n'ont d'effet qu'au niveau organisme.
ORG_EVENTS = {
    "organization.updated",
    "complaint.created",
    "complaint.updated",
    "watch.updated",
    "subcontractor.updated",
    "partner.updated",
    "staff_development.updated",
    "capa.closed",
    "document.issued",
    "document.signed",
}


def refresh_all(db: Session, trigger: str = "manuel", today: date | None = None) -> dict:
    """Réconciliation complète + réévaluation de tout (passe nocturne, bouton « tout réévaluer »)."""
    version = active_version(db)
    stats = reconcile(db, version, today=today)
    run = evaluate(db, version, trigger=trigger, today=today)
    _mark_all_processed(db)
    return {"evidence": stats, "run_id": run.id, "results": run.results_count}


def _mark_all_processed(db: Session) -> None:
    for ev in db.scalars(select(OutboxEvent).where(OutboxEvent.processed_at.is_(None))):
        ev.processed_at = utcnow()


def process_pending(db: Session, limit: int = 500, today: date | None = None) -> dict:
    """Traite les événements en attente. Idempotent : rejouer ne crée pas de doublon."""
    events = list(
        db.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.processed_at.is_(None))
            .order_by(OutboxEvent.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    if not events:
        return {"events": 0}
    version = active_version(db)

    session_ids: set[str] = set()
    include_org = False
    program_ids: set[str] = set()
    trainer_ids: set[str] = set()
    for ev in events:
        if ev.session_id:
            session_ids.add(ev.session_id)
        if ev.name in ORG_EVENTS or not (ev.session_id or ev.program_id or ev.entity_type == "trainer"):
            include_org = True
        if ev.program_id and not ev.session_id:
            program_ids.add(ev.program_id)
        if ev.entity_type == "trainer" or ev.name.startswith("trainer."):
            trainer_ids.add(ev.payload.get("trainer_id") or ev.entity_id)
    if program_ids:
        session_ids |= set(db.scalars(select(t.TrainingSession.id).where(t.TrainingSession.program_id.in_(program_ids))))
    if trainer_ids:
        session_ids |= set(db.scalars(select(t.TrainingSession.id).where(t.TrainingSession.trainer_id.in_(trainer_ids))))

    stats = reconcile(db, version, today=today)
    names = sorted({e.name for e in events})
    run = evaluate(
        db,
        version,
        trigger="event:" + ",".join(names)[:70],
        session_ids=session_ids,
        include_org=include_org,
        include_programs=bool(program_ids or session_ids),
        today=today,
    )
    for ev in events:
        ev.processed_at = utcnow()
    return {"events": len(events), "sessions": len(session_ids), "org": include_org, "evidence": stats, "run_id": run.id}
