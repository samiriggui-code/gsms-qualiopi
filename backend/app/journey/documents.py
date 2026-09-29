"""Documents rédigés par le moteur à partir des données : convocation et attestation de fin.

Le contenu vient uniquement de ce qui est enregistré (formation, session, demi-journées, émargement,
évaluations). Chaque émission est une version figée : fichier rangé par empreinte SHA-256, jamais
écrasé ; une réémission crée la version suivante et la précédente passe « remplacée ».
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.events.publish import publish
from app.training import models as t

TEMPLATES_DIR = BACKEND_DIR / "config" / "documents_generes"
ENTITY = "INSCRIPTION"
KINDS = {  # type de document → (modèle, titre, indicateurs Qualiopi)
    "CONVOCATION": ("convocation.html", "Convocation", [9]),
    "ATTESTATION_FIN": ("attestation_fin.html", "Attestation de fin de formation", [11]),
}
NATURES = {  # code du travail, L. 6313-1
    "AF": "Action de formation (code du travail, art. L. 6313-1, 1°)",
    "BC": "Bilan de compétences (code du travail, art. L. 6313-1, 2°)",
    "VAE": "Action permettant de faire valider les acquis de l'expérience (code du travail, art. L. 6313-1, 3°)",
    "APPRENTISSAGE": "Action de formation par apprentissage (code du travail, art. L. 6313-1, 4°)",
}
WEEKDAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(["html"]),
                   undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)


def _d(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _hours(value: Decimal | float | None) -> str | None:
    if value is None:
        return None
    q = Decimal(str(value)).quantize(Decimal("0.01")).normalize()
    return f"{q:f}".replace(".", ",")


def _slot_hours(sl: t.AttendanceSlot) -> Decimal | None:
    if sl.start_time is None or sl.end_time is None:
        return None
    minutes = (datetime.combine(sl.day, sl.end_time) - datetime.combine(sl.day, sl.start_time)).seconds // 60
    return Decimal(minutes) / 60


def _organization(db: Session) -> dict:
    org = db.scalar(select(t.Organization))
    return {
        "nom": org.name if org else "Organisme de formation",
        "siret": org.siret if org else None,
        "nda": org.nda_number if org else None,
        "referent_handicap": org.disability_referent_name if org else None,
        "referent_handicap_email": org.disability_referent_email if org else None,
    }


def _slots(s: t.TrainingSession) -> list[t.AttendanceSlot]:
    return sorted(s.attendance_slots, key=lambda sl: (sl.day, sl.period != "MATIN"))


def attendance_summary(e: t.Enrollment) -> dict:
    """Assiduité calculée depuis l'émargement : demi-journées et heures suivies sur prévues."""
    attended_ids = {sig.slot_id for sig in e.signatures if sig.present and sig.signed_at is not None}
    attended = [sl for sl in _slots(e.session) if sl.id in attended_ids]
    hours = [_slot_hours(sl) for sl in _slots(e.session)]
    known = all(h is not None for h in hours)
    return {
        "prevues": len(e.session.attendance_slots),
        "suivies": len(attended),
        "heures_prevues": _hours(sum(hours, Decimal(0))) if known else None,
        "heures_suivies": _hours(sum((_slot_hours(sl) for sl in attended), Decimal(0))) if known else None,
    }


def _context(db: Session, e: t.Enrollment, today: date) -> dict:
    s, p = e.session, e.session.program
    company = db.get(t.Company, e.company_id) if e.company_id else None
    days: dict[date, list[str]] = {}
    for sl in _slots(s):
        if sl.start_time and sl.end_time:
            days.setdefault(sl.day, []).append(f"{sl.start_time:%H:%M}–{sl.end_time:%H:%M}")
    return {
        "organisme": _organization(db),
        "stagiaire": e.learner.full_name,
        "entreprise": company.name if company else None,
        "emis_le": _d(today),
        "formation": {
            "code": p.code, "intitule": p.title, "duree": _hours(p.duration_hours),
            "objectifs": p.objectives or [], "prerequis": p.prerequisites or [],
            "nature": NATURES.get(p.action_category, NATURES["AF"]),
        },
        "session": {
            "reference": s.reference, "debut": _d(s.start_date), "fin": _d(s.end_date),
            "lieu": s.location or "", "salle": s.room, "formateur": s.trainer.full_name if s.trainer else None,
        },
        "horaires": [{"jour": f"{WEEKDAYS[d.weekday()]} {_d(d)}", "plages": " et ".join(v)} for d, v in days.items()],
        "assiduite": attendance_summary(e),
        "abandon": {"date": _d(e.abandoned_on)} if e.status == "ABANDON" and e.abandoned_on else None,
        "evaluations": [
            {"intitule": a.label, "nature": a.kind.lower(), "date": _d(a.assessed_on),
             "note": _hours(a.score), "resultat": {True: "acquis", False: "non acquis"}.get(a.passed, "—")}
            for a in sorted(e.assessments, key=lambda a: a.assessed_on)
        ],
    }


def current(db: Session, e: t.Enrollment, kind: str) -> t.Document | None:
    return db.scalar(select(t.Document).where(
        t.Document.entity_type == ENTITY, t.Document.entity_id == e.id, t.Document.kind == kind,
        t.Document.status != "REMPLACE"))


def history(db: Session, e: t.Enrollment) -> list[t.Document]:
    return list(db.scalars(select(t.Document).where(t.Document.entity_type == ENTITY, t.Document.entity_id == e.id)
                           .order_by(t.Document.kind, t.Document.version)))


def _store(content: bytes) -> tuple[str, str]:
    digest = hashlib.sha256(content).hexdigest()
    relative = f"{digest[:2]}/{digest}"
    target = Path(get_settings().documents_dir) / relative
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".part")
        tmp.write_bytes(content)
        tmp.replace(target)
    return digest, relative


def issue(db: Session, e: t.Enrollment, kind: str, actor_id: str | None, today: date, reason: str | None = None) -> t.Document:
    """Rédige et fige le document ; renvoie la nouvelle version."""
    template, title, indicators = KINDS[kind]
    previous = current(db, e, kind)
    version = previous.version + 1 if previous else 1
    reference = f"{kind.replace('_', '-')}-{e.session.reference}-{e.learner.last_name.upper()}"
    html = _env.get_template(template).render(**_context(db, e, today), titre=title,
                                              reference_document=reference, version=version)
    content = html.encode("utf-8")
    digest, relative = _store(content)
    doc = t.Document(
        kind=kind, title=f"{title} — {e.learner.full_name} — {e.session.reference}",
        entity_type=ENTITY, entity_id=e.id, session_id=e.session_id, program_id=e.session.program_id,
        version=version, previous_version_id=previous.id if previous else None, status="EMIS",
        author_id=actor_id, mime_type="text/html; charset=utf-8", storage_path=relative, sha256=digest,
        size_bytes=len(content), original_name=f"{reference}-v{version}.html", indicator_hints=indicators,
        support="GENERE", checklist_note=reason,
    )
    if previous is not None:
        previous.status = "REMPLACE"
    db.add(doc)
    db.flush()
    publish(db, "document.issued", "document", doc.id, session_id=e.session_id, program_id=e.session.program_id,
            actor_id=actor_id, payload={"kind": kind, "enrollment_id": e.id, "version": version})
    return doc


def doc_view(d: t.Document) -> dict:
    return {"id": d.id, "type": d.kind, "titre": d.title, "version": d.version, "statut": d.status,
            "sha256": d.sha256, "emis_le": d.created_at.isoformat() if d.created_at else None,
            "par": d.created_by, "motif": d.checklist_note}
