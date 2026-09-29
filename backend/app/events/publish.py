from sqlalchemy.orm import Session

from app.events.models import OutboxEvent

# Catalogue des événements métier émis par le domaine formation.
EVENT_NAMES = {
    "settings.changed",
    "feature.changed",
    "organization.updated",
    "program.created",
    "program.updated",
    "session.created",
    "session.updated",
    "session.status_changed",
    "learner.enrolled",
    "enrollment.updated",
    "needs_analysis.completed",
    "positioning.completed",
    "convocation.sent",
    "agreement.signed",
    "attendance.signed",
    "assessment.completed",
    "certificate.issued",
    "survey.completed",
    "complaint.created",
    "complaint.updated",
    "trainer.updated",
    "trainer.qualification_updated",
    "staff_development.updated",
    "watch.updated",
    "subcontractor.updated",
    "partner.updated",
    "document.issued",
    "document.signed",
    "capa.verification_requested",
    "capa.closed",
}


def publish(
    db: Session,
    name: str,
    entity_type: str,
    entity_id: str,
    *,
    session_id: str | None = None,
    program_id: str | None = None,
    actor_id: str | None = None,
    payload: dict | None = None,
) -> OutboxEvent:
    """Ajoute l'événement à la transaction en cours (pas de commit ici)."""
    if name not in EVENT_NAMES:
        raise ValueError(f"Événement inconnu : {name}")
    ev = OutboxEvent(
        name=name,
        entity_type=entity_type,
        entity_id=entity_id,
        session_id=session_id,
        program_id=program_id,
        actor_id=actor_id,
        payload=payload or {},
    )
    db.add(ev)
    return ev
