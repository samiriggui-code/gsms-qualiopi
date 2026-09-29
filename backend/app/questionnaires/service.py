"""Questionnaires en ligne : invitation, affichage public, réponse → données réelles → preuves.

Une réponse devient ce que le personnel aurait saisi : analyse du besoin et positionnement (sans jamais
écraser une saisie existante), appréciation à chaud ou à froid. Les événements habituels sont publiés :
le moteur Qualiopi met ses preuves et son échéancier à jour comme pour une saisie à la main.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import DomainError, NotFoundError
from app.core.journal import set_actor
from app.events.publish import publish
from app.questionnaires import definitions, tokens
from app.questionnaires.models import Invitation
from app.training import models as t

PURPOSE = "questionnaire"
VALIDITY_DAYS = {"BESOIN_POSITIONNEMENT": 30, "SATISFACTION_CHAUD": 30, "SATISFACTION_FROID": 45, "ENTREPRISE_FROID": 45}
AUDIENCES = {"SATISFACTION_CHAUD": "APPRENANT_CHAUD", "SATISFACTION_FROID": "APPRENANT_FROID", "ENTREPRISE_FROID": "ENTREPRISE"}


class LinkClosed(DomainError):
    status_code = 410
    code = "link_closed"


def get_or_create(db: Session, e: t.Enrollment, kind: str, today: date) -> Invitation:
    inv = db.scalar(select(Invitation).where(Invitation.enrollment_id == e.id, Invitation.kind == kind))
    if inv is None:
        inv = Invitation(kind=kind, enrollment_id=e.id, session_id=e.session_id,
                         respondent="ENTREPRISE" if kind == "ENTREPRISE_FROID" else "STAGIAIRE",
                         expires_on=today + timedelta(days=VALIDITY_DAYS[kind]), created_by="relances")
        db.add(inv)
        db.flush()
    elif inv.answered_at is None and inv.expires_on < today + timedelta(days=7):
        inv.expires_on = today + timedelta(days=VALIDITY_DAYS[kind])  # une relance prolonge le lien
    return inv


def link(inv: Invitation) -> str:
    return f"{get_settings().public_url.rstrip('/')}/q/{tokens.sign(PURPOSE, inv.id)}"


def _invitation(db: Session, token: str, today: date) -> Invitation:
    inv_id = tokens.verify(PURPOSE, token)
    inv = db.get(Invitation, inv_id) if inv_id else None
    if inv is None:
        raise NotFoundError("Lien invalide")
    if inv.answered_at is not None:
        raise LinkClosed("Merci, vos réponses ont déjà été enregistrées.")
    if inv.expires_on < today:
        raise LinkClosed("Ce lien a expiré. Contactez l'organisme de formation pour en recevoir un nouveau.")
    return inv


def _values(db: Session, e: t.Enrollment) -> dict[str, str]:
    prereq = [p for p in (e.session.program.prerequisites or []) if p.strip().lower() != "aucun"]
    return {"prerequis": ", ".join(prereq) if prereq else "aucun prérequis particulier", "stagiaire": e.learner.full_name}


def public_view(db: Session, token: str, today: date | None = None) -> dict:
    today = today or date.today()
    inv = _invitation(db, token, today)
    e = db.get(t.Enrollment, inv.enrollment_id)
    s = e.session
    org = db.scalar(select(t.Organization))
    if inv.opened_at is None:
        inv.opened_at = utcnow()
    q = definitions.load(inv.kind)
    return {
        "organisme": org.name if org else None,
        "formation": s.program.title,
        "session": {"reference": s.reference, "debut": s.start_date.isoformat(), "fin": s.end_date.isoformat()},
        "pour": e.learner.first_name if inv.respondent == "STAGIAIRE" else None,
        "questionnaire": definitions.personalised(q, _values(db, e)),
        "expire_le": inv.expires_on.isoformat(),
    }


def _yes(v: object) -> str:
    return "oui" if v is True else "non" if v is False else "—"


def submit(db: Session, token: str, answers: dict, today: date | None = None) -> dict:
    today = today or date.today()
    inv = _invitation(db, token, today)
    q = definitions.load(inv.kind)
    clean = definitions.check(q, answers or {})
    e = db.get(t.Enrollment, inv.enrollment_id)
    s = e.session
    who = f"{e.learner.full_name} (questionnaire en ligne)" if inv.respondent == "STAGIAIRE" else "Entreprise (questionnaire en ligne)"
    set_actor(db, who)
    base = dict(session_id=s.id, program_id=s.program_id, payload={"enrollment_id": e.id, "questionnaire": inv.kind})

    if inv.kind == "BESOIN_POSITIONNEMENT":
        if e.needs_analysis is None or e.needs_analysis.completed_on is None:
            na = e.needs_analysis or t.NeedsAnalysis(enrollment_id=e.id)
            na.completed_on = today
            na.summary = f"{clean['objectif']} — situation : {clean['situation']} ; expérience : {clean['experience']}"
            na.adaptation_required = bool(clean.get("amenagement"))
            na.adaptation_notes = clean.get("amenagement_detail")
            na.adaptation_status = "A_TRAITER" if na.adaptation_required else "AUCUNE"
            e.needs_analysis = na
            db.flush()
            publish(db, "needs_analysis.completed", "needs_analysis", na.id, **base)
        if e.positioning is None or e.positioning.completed_on is None:
            pos = e.positioning or t.Positioning(enrollment_id=e.id)
            pos.completed_on = today
            pos.method = "Questionnaire en ligne (auto-positionnement)"
            pos.level = f"{clean['niveau']}/5 (auto-évaluation), expérience : {clean['experience']}"
            pos.prerequisites_met = clean["prerequis"]
            e.positioning = pos
            db.flush()
            publish(db, "positioning.completed", "positioning", pos.id, **base)
    else:
        audience = AUDIENCES[inv.kind]
        sv = db.scalar(select(t.SatisfactionSurvey).where(t.SatisfactionSurvey.enrollment_id == e.id,
                                                          t.SatisfactionSurvey.audience == audience))
        if sv is None:
            sv = t.SatisfactionSurvey(session_id=s.id, enrollment_id=e.id, audience=audience, sent_on=inv.created_at.date())
            db.add(sv)
        sv.answered_on = today
        sv.score = Decimal(clean["note_globale"])
        sv.comment = clean.get("commentaire")
        db.flush()
        publish(db, "survey.completed", "satisfaction_survey", sv.id, **base)

    inv.answered_at = utcnow()
    inv.answers = clean
    inv.questionnaire_version = q.version
    return {"merci": True, "questionnaire": q.titre}


def answers_view(db: Session, enrollment_id: str) -> list[dict]:
    """Réponses reçues pour un stagiaire (écran du parcours), avec l'intitulé des questions."""
    out = []
    for inv in db.scalars(select(Invitation).where(Invitation.enrollment_id == enrollment_id).order_by(Invitation.created_at)):
        q = definitions.load(inv.kind)
        out.append({
            "questionnaire": q.titre, "type": inv.kind, "envoye_le": inv.created_at.isoformat() if inv.created_at else None,
            "ouvert_le": inv.opened_at.isoformat() if inv.opened_at else None,
            "repondu_le": inv.answered_at.isoformat() if inv.answered_at else None,
            "reponses": [{"question": x.libelle, "reponse": _yes(v) if isinstance(v, bool) else v}
                         for x in q.questions if (v := (inv.answers or {}).get(x.id)) is not None],
        })
    return out
