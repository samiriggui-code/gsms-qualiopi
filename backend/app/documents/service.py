"""Dépôt de pièces, versions, demandes et état d'un dossier."""

from __future__ import annotations

import hashlib
import json
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import InvalidStateError, NotFoundError
from app.documents import storage
from app.documents.dossier import SUBJECTS, check_answers, find_item, load_templates
from app.documents.models import DocumentRequest
from app.events.publish import publish
from app.qualiopi.evidence.models import Evidence
from app.training import models as t


def _check_subject(db: Session, subject: str, subject_id: str) -> None:
    if subject not in SUBJECTS:
        raise InvalidStateError(f"Sujet de dossier inconnu : {subject}")
    model = {"ORGANISME": t.Organization, "FORMATEUR": t.Trainer}[subject]
    if db.get(model, subject_id) is None:
        raise NotFoundError(f"{subject.title()} introuvable")


def current_document(db: Session, subject: str, subject_id: str, requirement: str) -> t.Document | None:
    return db.scalar(
        select(t.Document).where(
            t.Document.entity_type == subject,
            t.Document.entity_id == subject_id,
            t.Document.requirement == requirement,
            t.Document.status != "REMPLACE",
        )
    )


def _frozen_checklist(item, checklist: dict[str, str] | None, note: str | None) -> dict | None:  # noqa: ANN001
    if not item.grille:
        if checklist:
            raise InvalidStateError(f"La pièce {item.code} n'a pas de grille à cocher")
        return None
    if checklist is None:
        return None  # déposée sans grille : le moteur la signalera « à compléter »
    frozen, _ = check_answers(item.grille, checklist, note)
    return frozen


def _new_version(db: Session, *, subject: str, subject_id: str, item, actor_id: str | None,  # noqa: ANN001
                 fields: dict) -> t.Document:
    """Crée la nouvelle version d'une pièce : la précédente passe REMPLACE, rien n'est écrasé."""
    previous = current_document(db, subject, subject_id, item.code)
    doc = t.Document(
        kind=item.code,
        requirement=item.code,
        title=item.label,
        entity_type=subject,
        entity_id=subject_id,
        version=(previous.version + 1) if previous else 1,
        previous_version_id=previous.id if previous else None,
        status="EMIS",
        author_id=actor_id,
        indicator_hints=list(item.indicators),
        **fields,
    )
    if previous is not None:
        previous.status = "REMPLACE"
    db.add(doc)
    db.flush()
    for req in db.scalars(select(DocumentRequest).where(
        DocumentRequest.subject == subject, DocumentRequest.subject_id == subject_id,
        DocumentRequest.requirement == item.code, DocumentRequest.status == "OUVERTE",
    )):
        req.status = "SATISFAITE"
        req.fulfilled_at = utcnow()
        req.fulfilled_document_id = doc.id
    publish(db, "document.issued", "document", doc.id, actor_id=actor_id,
            payload={"requirement": item.code, "subject": subject, "subject_id": subject_id})
    return doc


def upload(db: Session, *, subject: str, subject_id: str, requirement: str, content: bytes,
           filename: str, mime: str, actor_id: str | None = None,
           checklist: dict[str, str] | None = None, note: str | None = None) -> t.Document:
    """Dépose une pièce (fichier) avec, si elle a une grille, les points cochés par le déposant."""
    _check_subject(db, subject, subject_id)
    item = find_item(subject, requirement)
    frozen = _frozen_checklist(item, checklist, note)
    stored = storage.store(content, mime)
    return _new_version(db, subject=subject, subject_id=subject_id, item=item, actor_id=actor_id, fields={
        "mime_type": mime, "storage_path": stored.relative_path, "sha256": stored.sha256,
        "size_bytes": stored.size, "original_name": filename[:250],
        "support": "FICHIER", "checklist": frozen, "checklist_note": note,
    })


def declare_paper(db: Session, *, subject: str, subject_id: str, requirement: str, checklist: dict[str, str],
                  location: str, note: str | None = None, actor_id: str | None = None) -> t.Document:
    """Déclare une pièce papier : l'original reste hors GSMS, à l'endroit indiqué.

    La grille est obligatoire (c'est tout ce que le moteur sait de la pièce) ; l'empreinte porte
    sur la déclaration elle-même, qui ne peut plus changer sans nouvelle version.
    """
    _check_subject(db, subject, subject_id)
    item = find_item(subject, requirement)
    if not item.grille:
        raise InvalidStateError(f"La pièce {item.code} doit être déposée en fichier (pas de grille)")
    if not (location or "").strip():
        raise InvalidStateError("Indiquez où l'original papier est conservé")
    frozen = _frozen_checklist(item, checklist, note)
    declaration = json.dumps({"piece": item.code, "lieu": location.strip(), "grille": frozen, "note": note},
                             ensure_ascii=False, sort_keys=True)
    return _new_version(db, subject=subject, subject_id=subject_id, item=item, actor_id=actor_id, fields={
        "mime_type": "application/json", "storage_path": None,
        "sha256": hashlib.sha256(declaration.encode()).hexdigest(), "size_bytes": None,
        "original_name": f"Original papier : {location.strip()}"[:250],
        "support": "PAPIER", "checklist": frozen, "checklist_note": note,
    })


def request_document(db: Session, *, subject: str, subject_id: str, requirement: str, requested_from: str,
                     due_on: date, message: str | None) -> DocumentRequest:
    _check_subject(db, subject, subject_id)
    find_item(subject, requirement)
    req = DocumentRequest(subject=subject, subject_id=subject_id, requirement=requirement,
                          requested_from=requested_from, due_on=due_on, message=message)
    db.add(req)
    db.flush()
    return req


def dossier_status(db: Session, subject: str, subject_id: str, today: date | None = None) -> dict:
    """État pièce par pièce : MANQUANTE, DEMANDEE, EN_RETARD, A_COMPLETER, RECUE, VALIDEE, REJETEE, EXPIREE."""
    today = today or date.today()
    _check_subject(db, subject, subject_id)
    tpl = load_templates()[subject]
    docs = {d.requirement: d for d in db.scalars(select(t.Document).where(
        t.Document.entity_type == subject, t.Document.entity_id == subject_id, t.Document.status != "REMPLACE"))}
    evidence = {e.source_id: e for e in db.scalars(select(Evidence).where(
        Evidence.source_table == "formation.document", Evidence.source_id.in_([d.id for d in docs.values()] or [""])))}
    requests = {}
    for r in db.scalars(select(DocumentRequest).where(
            DocumentRequest.subject == subject, DocumentRequest.subject_id == subject_id, DocumentRequest.status == "OUVERTE")):
        requests.setdefault(r.requirement, r)
    items = []
    for item in tpl.items:
        doc = docs.get(item.code)
        ev = evidence.get(doc.id) if doc else None
        req = requests.get(item.code)
        if doc is None:
            state = ("EN_RETARD" if req.due_on < today else "DEMANDEE") if req else "MANQUANTE"
        elif ev is None:
            state = "RECUE"  # pas encore vue par le moteur
        else:
            state = {"VALIDEE": "VALIDEE", "REJETEE": "REJETEE", "EXPIREE": "EXPIREE"}.get(ev.status, "RECUE")
            if state == "RECUE" and ev.form_issues:
                state = "A_COMPLETER"  # grille de dépôt absente ou point non satisfait
        items.append({
            "code": item.code, "label": item.label, "required": item.required, "indicators": item.indicators, "state": state,
            "modele": bool(item.modele), "grille": [g.model_dump() for g in item.grille],
            "document": {"id": doc.id, "version": doc.version, "sha256": doc.sha256, "name": doc.original_name,
                         "uploaded_at": doc.created_at.isoformat(), "by": doc.created_by, "support": doc.support,
                         # réponses du déposant : pré-remplissent la grille de la personne qui valide
                         "grille_depot": doc.checklist, "note_depot": doc.checklist_note} if doc else None,
            "evidence": {"id": ev.id, "reference": ev.reference, "status": ev.status, "issues": ev.form_issues,
                         "valid_until": ev.valid_until.isoformat() if ev.valid_until else None} if ev else None,
            "request": {"id": req.id, "from": req.requested_from, "due_on": req.due_on.isoformat()} if req else None,
        })
    required = [i for i in items if i["required"]]
    complete = sum(1 for i in required if i["state"] in ("RECUE", "VALIDEE"))
    return {"subject": subject, "subject_id": subject_id, "label": tpl.label, "items": items,
            "complete": complete, "required": len(required)}
