"""Conditions nommées des relances. Elles lisent les données existantes ; rien n'est saisi en double.

Une condition est évaluée à la planification, puis relue juste avant l'envoi : si la chose est faite
entre-temps (convention signée, évaluation saisie…), le message est annulé au lieu de partir.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.qualiopi.schedule.models import MilestoneStatus
from app.training import models as t


@dataclass
class Ctx:
    db: Session
    today: date
    session: t.TrainingSession | None = None
    enrollment: t.Enrollment | None = None
    milestone: MilestoneStatus | None = None


ACTIVE = ("INSCRIT", "CONFIRME")


def _inscription_active(c: Ctx) -> bool:
    return c.enrollment is not None and c.enrollment.status in ACTIVE and c.session.status not in ("ANNULEE", "CLOTUREE")


def _convention_non_signee(c: Ctx) -> bool:
    ag = c.enrollment.agreement if c.enrollment else None
    return _inscription_active(c) and not (ag and ag.signed_on)


def _session_a_venir(c: Ctx) -> bool:
    return c.session is not None and c.session.status in ("PLANIFIEE", "CONFIRMEE") and c.session.start_date >= c.today


def _evaluations_manquantes(c: Ctx) -> bool:
    s = c.session
    if s is None or s.status in ("ANNULEE", "CLOTUREE"):
        return False
    return any(not e.assessments for e in s.enrollments if e.status in (*ACTIVE, "TERMINE"))


def _jalon_non_fait(c: Ctx) -> bool:
    m = c.milestone
    return m is not None and m.status in ("A_ECHEANCE", "EN_RETARD")


def _toujours(c: Ctx) -> bool:
    return True


def _answered(c: Ctx, kind: str) -> bool:
    from app.questionnaires.models import Invitation

    return c.db.scalar(select(Invitation.id).where(Invitation.enrollment_id == c.enrollment.id, Invitation.kind == kind,
                                                   Invitation.answered_at.is_not(None))) is not None


def _survey(c: Ctx, audience: str) -> bool:
    return c.db.scalar(select(t.SatisfactionSurvey.id).where(
        t.SatisfactionSurvey.enrollment_id == c.enrollment.id, t.SatisfactionSurvey.audience == audience,
        t.SatisfactionSurvey.answered_on.is_not(None))) is not None


def _besoin_a_recueillir(c: Ctx) -> bool:
    e = c.enrollment
    missing = not (e.needs_analysis and e.needs_analysis.completed_on) or not (e.positioning and e.positioning.completed_on)
    return _inscription_active(c) and missing and not _answered(c, "BESOIN_POSITIONNEMENT")


def _satisfaction_chaud(c: Ctx) -> bool:
    return (c.enrollment.status in (*ACTIVE, "TERMINE") and c.session.status != "ANNULEE"
            and not _survey(c, "APPRENANT_CHAUD"))


def _satisfaction_froid(c: Ctx) -> bool:
    return c.enrollment.status == "TERMINE" and not _survey(c, "APPRENANT_FROID")


def _entreprise_froid(c: Ctx) -> bool:
    e = c.enrollment
    company_id = e.company_id or e.learner.company_id
    return e.status == "TERMINE" and company_id is not None and not _survey(c, "ENTREPRISE")


def _transmitted(c: Ctx, rule_key: str) -> bool:
    from app.relances.models import Message

    return c.db.scalar(select(Message.id).where(Message.rule_key == rule_key, Message.enrollment_id == c.enrollment.id,
                                                Message.status == "ENVOYE")) is not None


def _convocation_a_transmettre(c: Ctx) -> bool:
    conv = c.enrollment.convocation
    return _inscription_active(c) and bool(conv and conv.document_id) and not _transmitted(c, "document.convocation")


def _attestation_a_transmettre(c: Ctx) -> bool:
    cert = c.enrollment.certificate
    return (c.enrollment.status in ("TERMINE", "ABANDON") and bool(cert and cert.document_id)
            and not _transmitted(c, "document.attestation"))


CONDITIONS: dict[str, Callable[[Ctx], bool]] = {
    "inscription_active": _inscription_active,
    "convention_non_signee": _convention_non_signee,
    "session_a_venir": _session_a_venir,
    "evaluations_manquantes": _evaluations_manquantes,
    "jalon_non_fait": _jalon_non_fait,
    "toujours": _toujours,
    "besoin_a_recueillir": _besoin_a_recueillir,
    "satisfaction_chaud_a_recueillir": _satisfaction_chaud,
    "satisfaction_froid_a_recueillir": _satisfaction_froid,
    "entreprise_a_recueillir": _entreprise_froid,
    "convocation_a_transmettre": _convocation_a_transmettre,
    "attestation_a_transmettre": _attestation_a_transmettre,
}

LABELS = {
    "inscription_active": "l'inscription n'est plus active",
    "convention_non_signee": "la convention est signée",
    "session_a_venir": "la session a commencé ou n'est plus prévue",
    "evaluations_manquantes": "les évaluations sont saisies",
    "jalon_non_fait": "le jalon est fait",
    "toujours": "",
    "besoin_a_recueillir": "l'analyse du besoin et le positionnement sont faits",
    "satisfaction_chaud_a_recueillir": "l'appréciation à chaud est recueillie",
    "satisfaction_froid_a_recueillir": "l'appréciation à froid est recueillie",
    "entreprise_a_recueillir": "l'entreprise a répondu",
    "convocation_a_transmettre": "la convocation a déjà été transmise",
    "attestation_a_transmettre": "l'attestation a déjà été transmise",
}
