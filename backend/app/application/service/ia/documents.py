"""Base « Documents de l'organisme » du moteur IA, tenue à jour depuis les documents de GSMS.

GSMS reste la source : le moteur IA n'en reçoit qu'une copie de travail (lecture, découpage, recherche), qu'on peut
effacer et reconstruire à tout moment par `sync_org_documents`. La synchronisation est idempotente :

- **verse** chaque document éligible absent de la base (fichier stocké, relu avec son empreinte), avec ses
  métadonnées GSMS (`gsms_document_id`, `gsms_version`, `gsms_sha256`, `gsms_kind`) ;
- **retire** de la base tout document versé par GSMS qui n'est plus éligible : remplacé par une nouvelle version,
  retiré, passé en brouillon, ou dont le fichier a changé ;
- laisse tel quel ce qu'une personne aurait déposé à la main dans la base (sans métadonnée GSMS) et le signale.

Éligibilité (liste blanche, `eligible_documents`) : seules les pièces **de l'organisme** et les **programmes** de
formation, émis ou signés, version en cours, dans un format que le moteur sait lire. Jamais une pièce de session
(convocation, attestation, émargement…), de formateur (CV, diplômes) ni de facturation : elles nomment des personnes,
et une base de connaissances est lisible par tous les comptes de l'espace.
"""

from __future__ import annotations

import json
from pathlib import PurePosixPath

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.documents import storage
from app.application.service.ia.espace import Report, _all_knowledge, _attach_models, _data, _ok
from app.application.service.ia.weknora import call, message_of, upload
from app.errors.errors import DomainError
from app.types import training as t

KB_NAME = "Documents de l'organisme"
KB_DESCRIPTION = ("Documents de l'organisme de formation versés par GSMS Qualiopi : pièces du dossier de l'organisme et "
                  "programmes de formation, version en cours. Aucune pièce nominative. Tenue à jour par GSMS : ne pas "
                  "y déposer de document à la main.")
STATUSES = ("EMIS", "SIGNE")
# Type GSMS → extension du fichier envoyé (le moteur IA choisit sa lecture d'après l'extension).
FORMATS = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/html": ".html",
}


def _format(mime: str) -> str | None:
    return FORMATS.get(mime.split(";")[0].strip().lower())


def eligible_documents(db: Session) -> list[t.Document]:
    """Documents de GSMS que la base peut recevoir (voir la docstring du module)."""
    q = select(t.Document).where(
        t.Document.status.in_(STATUSES), t.Document.session_id.is_(None), t.Document.storage_path.is_not(None),
        t.Document.sha256.is_not(None),
        (t.Document.entity_type == "ORGANISME") | ((t.Document.kind == "PROGRAMME") & t.Document.program_id.is_not(None)),
    ).order_by(t.Document.created_at)
    return [d for d in db.scalars(q) if _format(d.mime_type)]


def _metadata(doc: t.Document) -> dict[str, str]:
    return {"gsms_document_id": doc.id, "gsms_version": str(doc.version), "gsms_sha256": doc.sha256 or "",
            "gsms_kind": doc.kind, "source": "GSMS Qualiopi"}


def _file_name(doc: t.Document) -> str:
    stem = PurePosixPath(doc.title.replace("/", "-")).name[:180] or doc.kind
    return f"{stem} (v{doc.version}){_format(doc.mime_type)}"


def _ensure_kb(token: str, report: Report) -> dict | None:
    bases = _data(*call("GET", "/api/v1/knowledge-bases", token=token), "Liste des bases de connaissances") or []
    kb = next((b for b in bases if b.get("name") == KB_NAME), None)
    if kb is None:
        status, body = call("POST", "/api/v1/knowledge-bases", {"name": KB_NAME, "description": KB_DESCRIPTION}, token=token)
        if not (_ok(status, body) and (body.get("data") or {}).get("id")):
            report.problems.append(f"Base « {KB_NAME} » non créée : {message_of(body)} (HTTP {status})")
            return None
        kb = body["data"]
        report.done.append(f"Base « {KB_NAME} » créée")
    if not kb.get("embedding_model_id"):
        _attach_models(kb, token, report)
    if not kb.get("embedding_model_id"):
        report.problems.append(f"La base « {KB_NAME} » n'a pas de modèle d'embedding : documents versés mais non indexés")
    return kb


def sync_org_documents(db: Session, token: str) -> Report:
    """Base « Documents de l'organisme » alignée sur les documents éligibles de GSMS (jeton du compte de service)."""
    report = Report()
    kb = _ensure_kb(token, report)
    if kb is None:
        return report
    wanted = {d.id: d for d in eligible_documents(db)}
    present: dict[str, dict] = {}
    manual = 0
    for row in _all_knowledge(kb["id"], token):
        meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        doc_id = meta.get("gsms_document_id")
        if not doc_id:
            manual += 1
            continue
        doc = wanted.get(doc_id)
        if doc is None or meta.get("gsms_sha256") != doc.sha256 or doc_id in present:
            status, body = call("DELETE", f"/api/v1/knowledge/{row['id']}", token=token)
            if _ok(status, body):
                report.done.append(f"Retiré de la base : « {row.get('title') or row.get('file_name')} » (plus éligible)")
            else:
                report.problems.append(f"Retrait refusé pour « {row.get('title')} » : {message_of(body)} (HTTP {status})")
            continue
        present[doc_id] = row

    added = 0
    for doc in wanted.values():
        if doc.id in present:
            continue
        try:
            content = storage.read(doc.storage_path, doc.sha256)
        except (OSError, DomainError) as e:
            report.problems.append(f"« {doc.title} » non versé : fichier illisible ({e})")
            continue
        status, body = upload(f"/api/v1/knowledge-bases/{kb['id']}/knowledge/file",
                              {"fileName": _file_name(doc), "metadata": json.dumps(_metadata(doc), ensure_ascii=False)},
                              _file_name(doc), content, doc.mime_type.split(";")[0].strip(), token)
        if _ok(status, body):
            added += 1
        else:
            report.problems.append(f"« {doc.title} » refusé par le moteur IA : {message_of(body)} (HTTP {status})")
    if added:
        report.done.append(f"{added} document(s) versé(s) dans la base « {KB_NAME} »")
    report.done.append(f"{len(present) + added} document(s) de l'organisme dans la base sur {len(wanted)} éligible(s)")
    if manual:
        report.problems.append(f"{manual} document(s) déposé(s) à la main dans la base « {KB_NAME} » : laissés tels quels, "
                               "mais ils échappent à GSMS (ni version, ni retrait automatique)")
    failed = [k for k in present.values() if k.get("parse_status") == "failed"]
    if failed:
        report.problems.append(f"{len(failed)} document(s) en échec d'indexation (ex. : {failed[0].get('error_message') or 'sans motif'})")
    return report

