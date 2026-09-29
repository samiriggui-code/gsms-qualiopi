"""Envoi, validation et annulation des messages ; vue pour l'écran « Communications »."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import InvalidStateError, NotFoundError
from app.platform.decisions import deny, enforce
from app.platform.settings import ConfigurationService
from app.qualiopi.schedule.models import MilestoneStatus
from app.relances.conditions import CONDITIONS, LABELS, Ctx
from app.relances.models import Message
from app.relances.rules import rule as find_rule
from app.relances.sender import get_sender
from app.training import models as t

MAX_ATTEMPTS = 3


def get_message(db: Session, message_id: str) -> Message:
    msg = db.get(Message, message_id)
    if msg is None:
        raise NotFoundError("Message introuvable")
    return msg


def still_relevant(db: Session, msg: Message, today: date) -> str | None:
    """None si le message doit toujours partir ; sinon le motif pour lequel il est devenu sans objet."""
    r = find_rule(msg.rule_key)
    if r is None:
        return "Règle supprimée du calendrier"
    if r.cle in ConfigurationService(db).get("relances.regles_desactivees", at=today):
        return "Règle désactivée par l'organisme"
    s = db.get(t.TrainingSession, msg.session_id) if msg.session_id else None
    e = db.get(t.Enrollment, msg.enrollment_id) if msg.enrollment_id else None
    m = None
    if msg.milestone_key and s is not None:
        m = db.scalar(select(MilestoneStatus).where(MilestoneStatus.session_id == s.id, MilestoneStatus.key == msg.milestone_key))
    if (msg.session_id and s is None) or (msg.enrollment_id and e is None):
        return "Session ou inscription supprimée"
    if s is not None and s.status == "ANNULEE":
        return "Session annulée"
    if not CONDITIONS[r.condition](Ctx(db, today, session=s, enrollment=e, milestone=m)):
        return f"Devenu sans objet : {LABELS[r.condition]}"
    return None


def _send(db: Session, msg: Message, today: date) -> None:
    reason = still_relevant(db, msg, today)
    if reason:
        msg.status, msg.cancel_reason = "ANNULE", reason
        return
    org = db.scalar(select(t.Organization))
    config = ConfigurationService(db)
    msg.attempts += 1
    try:
        msg.provider_message_id = get_sender().send(
            to=msg.recipient_email, to_name=msg.recipient_name, subject=msg.subject, html=msg.body_html,
            text=msg.body_text, from_name=config.get("general.brand_short_name") or (org.name if org else "GSMS"),
            reply_to=config.get("relances.adresse_reponse", at=today) or None,
        )
    except Exception as exc:  # noqa: BLE001 — toute erreur d'envoi est tracée sur le message
        msg.last_error = f"{type(exc).__name__}: {exc}"[:2000]
        if msg.attempts >= MAX_ATTEMPTS:
            msg.status = "ECHEC"
        return
    msg.status, msg.sent_at, msg.last_error = "ENVOYE", utcnow(), None


def dispatch(db: Session, today: date | None = None) -> dict:
    """Envoie les messages prévus dont la date est arrivée (le worker l'appelle à chaque passage)."""
    today = today or date.today()
    rows = list(db.scalars(select(Message).where(Message.status == "PREVU", Message.due_on <= today).order_by(Message.due_on)))
    for msg in rows:
        _send(db, msg, today)
    db.flush()
    return {"envoyes": sum(1 for m in rows if m.status == "ENVOYE"), "annules": sum(1 for m in rows if m.status == "ANNULE"),
            "echecs": sum(1 for m in rows if m.status == "ECHEC"), "en_erreur": sum(1 for m in rows if m.status == "PREVU")}


def validate(db: Session, msg: Message, actor: str, today: date | None = None) -> Message:
    """Validation d'un message externe : il part tout de suite (s'il a toujours lieu d'être)."""
    today = today or date.today()
    if msg.status != "A_VALIDER":
        enforce(deny("INVALID_STATE", f"Message au statut {msg.status.lower().replace('_', ' ')}"))
    msg.validated_by, msg.validated_at, msg.status = actor, utcnow(), "PREVU"
    if msg.due_on <= today:
        _send(db, msg, today)
    return msg


def cancel(db: Session, msg: Message, reason: str, actor: str) -> Message:
    if msg.status not in ("A_VALIDER", "PREVU", "ECHEC"):
        enforce(deny("INVALID_STATE", "Seul un message non envoyé s'annule"))
    if not (reason or "").strip():
        raise InvalidStateError("Indiquez le motif de l'annulation")
    msg.status, msg.cancel_reason = "ANNULE", f"{reason.strip()} ({actor})"
    return msg


def retry(db: Session, msg: Message, today: date | None = None) -> Message:
    if msg.status != "ECHEC":
        enforce(deny("INVALID_STATE", "Seul un message en échec se renvoie"))
    msg.status, msg.attempts = "PREVU", 0
    _send(db, msg, today or date.today())
    return msg


def message_view(msg: Message, full: bool = False) -> dict:
    out = {
        "id": msg.id, "reference": msg.reference, "regle": msg.rule_key, "modele": msg.template,
        "version_modele": msg.template_version, "externe": msg.external, "destinataire": {
            "type": msg.recipient_kind, "nom": msg.recipient_name, "email": msg.recipient_email},
        "objet": msg.subject, "statut": msg.status, "prevu_le": msg.due_on.isoformat(),
        "session_id": msg.session_id, "inscription_id": msg.enrollment_id, "indicateurs": msg.indicators,
        "valide_par": msg.validated_by, "valide_le": msg.validated_at.isoformat() if msg.validated_at else None,
        "envoye_le": msg.sent_at.isoformat() if msg.sent_at else None, "identifiant_envoi": msg.provider_message_id,
        "tentatives": msg.attempts, "erreur": msg.last_error, "motif_annulation": msg.cancel_reason,
        "empreinte": msg.body_sha256, "cree_le": msg.created_at.isoformat() if msg.created_at else None,
    }
    if full:
        out |= {"html": msg.body_html, "texte": msg.body_text}
    return out
