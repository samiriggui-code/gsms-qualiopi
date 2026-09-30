"""Activité d'une session : ce qui s'y est passé, par qui, quand (volet « Activité » de la fiche).

Source : les événements publiés dans la même transaction que chaque action (formation.outbox_event),
donc sans saisie en double et sans rien d'inventé.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.events.models import OutboxEvent
from app.training import models as t

LABELS = {
    "session.created": "a créé la session",
    "session.updated": "a modifié la session",
    "session.status_changed": "a changé le statut de la session",
    "learner.enrolled": "a inscrit",
    "enrollment.updated": "a mis à jour l'inscription de",
    "needs_analysis.completed": "a recueilli l'analyse du besoin de",
    "positioning.completed": "a positionné",
    "convocation.sent": "a convoqué",
    "agreement.signed": "a enregistré la convention signée de",
    "attendance.signed": "a émargé",
    "attendance.slot_validated": "a validé une demi-journée d'émargement",
    "assessment.completed": "a évalué",
    "certificate.issued": "a délivré l'attestation de",
    "survey.completed": "a recueilli l'appréciation de",
    "complaint.created": "a enregistré une réclamation",
    "complaint.updated": "a mis à jour une réclamation",
    "document.issued": "a émis un document pour",
    "document.signed": "a signé un document",
    "funding.source_changed": "a mis à jour le financement de",
}


def session_activity(db: Session, s: t.TrainingSession, limit: int = 100) -> list[dict]:
    events = list(db.scalars(select(OutboxEvent).where(OutboxEvent.session_id == s.id)
                             .order_by(OutboxEvent.occurred_at.desc(), OutboxEvent.id.desc()).limit(limit)))
    actors = {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_({e.actor_id for e in events if e.actor_id})))}
    learners = {e.id: e.learner.full_name for e in s.enrollments}
    out = []
    for ev in events:
        payload = ev.payload or {}
        enrollment_id = payload.get("enrollment_id") or (ev.entity_id if ev.entity_type == "enrollment" else None)
        if ev.actor_id:
            who = actors.get(ev.actor_id, "Un utilisateur")
        elif payload.get("questionnaire"):
            who = learners.get(enrollment_id, "Le stagiaire") if payload.get("questionnaire") != "ENTREPRISE_FROID" else "L'entreprise"
        else:
            who = "GSMS"
        out.append({
            "id": ev.id,
            "evenement": ev.name,
            "qui": who,
            "action": LABELS.get(ev.name, ev.name),
            "stagiaire": learners.get(enrollment_id),
            "le": ev.occurred_at.isoformat(),
            "en_ligne": bool(payload.get("questionnaire")),
        })
    return out
