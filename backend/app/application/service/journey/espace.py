"""Espace du stagiaire : une page personnelle ouverte par un lien signé, sans compte.

Le stagiaire y retrouve sa formation (dates, lieu, horaires, formateur), ce qui reste à faire de son
côté (questionnaires), ses documents (convocation, attestation) et ses contacts. Rien n'y est saisi :
la page ne fait que montrer, à une seule personne, ce que l'organisme a déjà enregistré.

Lien = identifiant d'inscription signé (HMAC, cf. questionnaires.tokens), valable jusqu'à
ESPACE_DAYS_AFTER jours après la fin de la session (temps des questionnaires à froid).
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.journey import documents
from app.application.service.platform.settings import ConfigurationService
from app.application.service.questionnaires import definitions, tokens
from app.application.service.questionnaires import service as questionnaires
from app.application.service.questionnaires.service import LinkClosed
from app.config.config import get_settings
from app.errors.errors import NotFoundError
from app.types import training as t
from app.types.questionnaires import Invitation

PURPOSE = "espace"
ESPACE_DAYS_AFTER = 120
PERIODS = {"MATIN": "Matin", "APRES_MIDI": "Après-midi"}


def expires_on(e: t.Enrollment) -> date:
    return e.session.end_date + timedelta(days=ESPACE_DAYS_AFTER)


def link(e: t.Enrollment) -> str:
    return f"{get_settings().public_url.rstrip('/')}/espace/{tokens.sign(PURPOSE, e.id)}"


def _enrollment(db: Session, token: str, today: date) -> t.Enrollment:
    enrollment_id = tokens.verify(PURPOSE, token)
    e = db.get(t.Enrollment, enrollment_id) if enrollment_id else None
    if e is None or e.status == "ANNULE":
        raise NotFoundError("Lien invalide")
    if today > expires_on(e):
        raise LinkClosed("Cet espace a fermé. Contactez l'organisme de formation si vous avez besoin d'un document.")
    return e


def _hhmm(value) -> str | None:  # noqa: ANN001
    return value.strftime("%H:%M") if value else None


def public_view(db: Session, token: str, today: date | None = None) -> dict:
    today = today or date.today()
    e = _enrollment(db, token, today)
    s = e.session
    org = db.scalar(select(t.Organization))
    config = ConfigurationService(db)
    base = get_settings().public_url.rstrip("/")

    # Documents émis par le moteur, dernière version de chaque type, chacun par son propre lien signé
    latest: dict[str, t.Document] = {}
    for d in documents.history(db, e):
        if d.status != "REMPLACE" and d.storage_path:
            latest[d.kind] = d
    docs = [{"type": d.kind, "titre": d.title, "emis_le": d.created_at.date().isoformat() if d.created_at else None,
             "lien": f"{base}/api/public/documents/{tokens.sign('document', f'{e.id}:{d.id}')}"}
            for d in latest.values()]

    # Questionnaires : ouverts (à remplir, avec leur lien) ou déjà répondus ; jamais ceux de l'entreprise
    todo, done = [], []
    for inv in db.scalars(select(Invitation).where(Invitation.enrollment_id == e.id, Invitation.respondent == "STAGIAIRE")
                          .order_by(Invitation.created_at)):
        title = definitions.load(inv.kind).titre
        if inv.answered_at is not None:
            done.append({"titre": title, "repondu_le": inv.answered_at.date().isoformat()})
        elif inv.expires_on >= today:
            todo.append({"titre": title, "jusqu_au": inv.expires_on.isoformat(), "lien": questionnaires.link(inv)})

    slots = sorted(s.attendance_slots, key=lambda sl: (sl.day, sl.period != "MATIN"))
    attended = {sig.slot_id for sig in e.signatures if sig.present and sig.signed_at is not None}
    return {
        "organisme": {
            "nom": config.get("general.brand_short_name") or (org.name if org else None),
            "contact": config.get("relances.adresse_reponse", at=today) or None,
            "referent_handicap": {"nom": org.disability_referent_name, "email": org.disability_referent_email}
            if org and org.disability_referent_name else None,
        },
        "stagiaire": {"prenom": e.learner.first_name, "statut": e.status},
        "formation": {
            "intitule": s.program.title if s.program else s.reference, "reference": s.reference,
            "debut": s.start_date.isoformat(), "fin": s.end_date.isoformat(), "statut": s.status,
            "lieu": s.location, "salle": s.room, "formateur": s.trainer.full_name if s.trainer else None,
        },
        "creneaux": [{"jour": sl.day.isoformat(), "periode": PERIODS.get(sl.period, sl.period),
                      "debut": _hhmm(sl.start_time), "fin": _hhmm(sl.end_time),
                      "present": sl.id in attended if sl.day <= today else None} for sl in slots],
        "assiduite": documents.attendance_summary(e),
        "a_faire": todo,
        "questionnaires_repondus": done,
        "documents": docs,
        "convention": {"signee_le": e.agreement.signed_on.isoformat()} if e.agreement and e.agreement.signed_on else None,
        "expire_le": expires_on(e).isoformat(),
    }
