"""API de la fiche formation (versions, programme, aperçu) et des dossiers de référencement EDOF."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.models import User
from app.auth.security import DB, permissions_of, require, require_any
from app.core.downloads import content_disposition
from app.core.errors import InvalidStateError, NotFoundError
from app.documents import storage
from app.edof import fiche, service, suivi
from app.edof import models as m
from app.edof.requirements import load
from app.events.publish import publish
from app.training import models as t

router = APIRouter(prefix="/api/v1", tags=["fiche formation et EDOF"])

ProgramReader = Annotated[User, Depends(require_any("sessions.read", "edof.read"))]
ProgramWriter = Annotated[User, Depends(require("sessions.write"))]
ProgramValidator = Annotated[User, Depends(require("programs.validate"))]
EdofReader = Annotated[User, Depends(require("edof.read"))]
EdofWriter = Annotated[User, Depends(require("edof.write"))]
EdofValidator = Annotated[User, Depends(require("edof.validate"))]


def _perms(db, user: User) -> frozenset[str]:  # noqa: ANN001
    return permissions_of(db, user)


# ── Fiche formation ──────────────────────────────────────────────────────────────


def _cert_dict(c: t.ProgramCertification | None) -> dict | None:
    if c is None:
        return None
    return {k.key: getattr(c, k.key) for k in t.ProgramCertification.__table__.columns
            if k.key not in ("program_id", "created_at", "updated_at")}


@router.get("/fiches/{program_id}")
def get_fiche(program_id: str, db: DB, user: ProgramReader) -> dict:
    p = fiche.get_program(db, program_id)
    perms = _perms(db, user)
    versions = list(db.scalars(select(t.ProgramVersion).where(t.ProgramVersion.program_id == p.id)
                               .order_by(t.ProgramVersion.version.desc())))
    dossier = service.formation_dossier(db, p.id)
    can = fiche.can_validate(db, p)
    return {
        "program": {c.key: getattr(p, c.key) for c in t.Program.__table__.columns},
        "certification": _cert_dict(fiche.certification_of(db, p.id)),
        "certification_bases": t.CERTIFICATION_BASES, "habilitations": t.HABILITATIONS,
        "delivery_modes": fiche.DELIVERY_LABELS, "roles": fiche.ROLE_LABELS,
        "trainers": [{"id": pt.id, "trainer_id": tr.id, "name": tr.full_name, "role": pt.role,
                      "modules": pt.modules, "qualifications": [
                          {"label": q.label, "kind": q.kind, "valid_until": q.valid_until} for q in tr.qualifications]}
                     for pt, tr in fiche.trainers_of(db, p.id)],
        "resources": [{c.key: getattr(r, c.key) for c in t.ProgramResource.__table__.columns}
                      for r in fiche.resources_of(db, p.id)],
        "missing": [{"field": f, "label": label, "message": msg} for f, label, msg in fiche.missing_fields(p)],
        "version_state": fiche.version_state(db, p),
        "versions": [{"id": v.id, "version": v.version, "sha256": v.sha256, "validated_by": v.validated_by,
                      "validated_at": v.validated_at, "note": v.note} for v in versions],
        "capabilities": {
            "edit": {"allowed": True} if "sessions.write" in perms else
            {"allowed": False, "code": "PERMISSION", "message": "Permission « formations » requise."},
            "validate": can.to_dict() if "programs.validate" in perms else
            {"allowed": False, "code": "PERMISSION", "message": "Permission « valider une fiche formation » requise."},
        },
        "dossier": {"id": dossier.id} if dossier else None,
    }


class CertificationIn(BaseModel):
    basis: str | None = None
    code: str | None = Field(default=None, max_length=20)
    title: str | None = None
    certifier: str | None = None
    registration_end: date | None = None
    source_url: str | None = None
    habilitation: str | None = None
    partner_siret: str | None = Field(default=None, max_length=20)
    evaluator_name: str | None = None
    competence_mapping: list[dict] | None = None
    other_requirements: list[dict] | None = None
    note: str | None = None


@router.put("/fiches/{program_id}/certification")
def put_certification(program_id: str, body: CertificationIn, db: DB, user: ProgramWriter) -> dict:
    p = fiche.get_program(db, program_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("basis") is not None and data["basis"] not in t.CERTIFICATION_BASES:
        raise InvalidStateError(f"Fondement inconnu : {', '.join(t.CERTIFICATION_BASES)}")
    if data.get("habilitation") is not None and data["habilitation"] not in t.HABILITATIONS:
        raise InvalidStateError(f"Habilitation inconnue : {', '.join(t.HABILITATIONS)}")
    cert = fiche.certification_of(db, p.id)
    if cert is None:
        cert = t.ProgramCertification(program_id=p.id, created_by=user.full_name)
        db.add(cert)
    before = (cert.basis, cert.code, cert.certifier, cert.registration_end)
    before_hab = (cert.habilitation, cert.partner_siret, cert.evaluator_name)
    for key, value in data.items():
        setattr(cert, key, value)
    # Une vérification attestée porte sur des valeurs précises : si elles changent, elle tombe.
    if (cert.basis, cert.code, cert.certifier, cert.registration_end) != before:
        cert.checked_on = cert.checked_by = None
    if (cert.habilitation, cert.partner_siret, cert.evaluator_name) != before_hab:
        cert.habilitation_checked_on = cert.habilitation_checked_by = None
    p.is_certifying = cert.basis in ("RNCP", "RS")
    p.rncp_code = cert.code if cert.basis in ("RNCP", "RS") else p.rncp_code
    db.flush()
    publish(db, "program.updated", "program", p.id, program_id=p.id, actor_id=user.id)
    db.commit()
    return _cert_dict(cert)


class VerificationIn(BaseModel):
    quoi: str  # certification | habilitation | autorisation
    index: int | None = None  # autorisation : rang dans other_requirements


@router.post("/fiches/{program_id}/verifications")
def attest_verification(program_id: str, body: VerificationIn, db: DB, user: ProgramValidator) -> dict:
    """Une personne atteste avoir vérifié la fiche France compétences, l'habilitation ou une autorisation."""
    p = fiche.get_program(db, program_id)
    cert = fiche.certification_of(db, p.id)
    if cert is None:
        raise InvalidStateError("Renseignez d'abord la certification visée")
    today = date.today()
    if body.quoi == "certification":
        if cert.basis not in ("RNCP", "RS") or not cert.code:
            raise InvalidStateError("Certification RNCP ou RS et son code requis avant vérification")
        cert.checked_on, cert.checked_by = today, user.full_name
    elif body.quoi == "habilitation":
        if cert.habilitation in (None, "A_VERIFIER"):
            raise InvalidStateError("Indiquez d'abord ce que le certificateur autorise (former, ou former et évaluer)")
        cert.habilitation_checked_on, cert.habilitation_checked_by = today, user.full_name
    elif body.quoi == "autorisation":
        reqs = list(cert.other_requirements or [])
        if body.index is None or not 0 <= body.index < len(reqs):
            raise NotFoundError("Autorisation introuvable")
        reqs[body.index] = {**reqs[body.index], "verified_on": today.isoformat(), "verified_by": user.full_name}
        cert.other_requirements = reqs
    else:
        raise InvalidStateError("Vérification attendue : certification, habilitation ou autorisation")
    db.commit()
    return _cert_dict(cert)


class TrainerLinkIn(BaseModel):
    trainer_id: str
    role: str = "FORMATEUR"
    modules: list[str] = Field(default_factory=list)


@router.post("/fiches/{program_id}/intervenants", status_code=201)
def add_trainer(program_id: str, body: TrainerLinkIn, db: DB, user: ProgramWriter) -> dict:
    p = fiche.get_program(db, program_id)
    if db.get(t.Trainer, body.trainer_id) is None:
        raise NotFoundError("Formateur introuvable")
    if body.role not in t.PROGRAM_TRAINER_ROLES:
        raise InvalidStateError(f"Rôle attendu : {', '.join(t.PROGRAM_TRAINER_ROLES)}")
    if db.scalar(select(t.ProgramTrainer).where(t.ProgramTrainer.program_id == p.id,
                                                 t.ProgramTrainer.trainer_id == body.trainer_id)):
        raise InvalidStateError("Ce formateur est déjà associé à la formation")
    link = t.ProgramTrainer(program_id=p.id, trainer_id=body.trainer_id, role=body.role, modules=body.modules,
                            created_by=user.full_name)
    db.add(link)
    db.commit()
    return {"id": link.id}


@router.delete("/fiches/{program_id}/intervenants/{link_id}", status_code=204)
def remove_trainer(program_id: str, link_id: str, db: DB, _: ProgramWriter) -> None:
    link = db.get(t.ProgramTrainer, link_id)
    if link is None or link.program_id != program_id:
        raise NotFoundError("Intervenant introuvable")
    db.delete(link)
    db.commit()


class ResourceIn(BaseModel):
    title: str | None = None
    kind: str | None = None
    module_code: str | None = None
    origin: str | None = None
    source_ref: str | None = None
    rights: str | None = None
    rights_note: str | None = None
    status: str | None = None
    note: str | None = None


def _check_resource(data: dict) -> None:
    for key, allowed in (("kind", t.RESOURCE_KINDS), ("origin", t.RESOURCE_ORIGINS), ("rights", t.RESOURCE_RIGHTS),
                         ("status", t.RESOURCE_STATUSES)):
        if data.get(key) is not None and data[key] not in allowed:
            raise InvalidStateError(f"{key} : valeurs possibles {', '.join(allowed)}")


@router.post("/fiches/{program_id}/ressources", status_code=201)
def add_resource(program_id: str, body: ResourceIn, db: DB, user: ProgramWriter) -> dict:
    p = fiche.get_program(db, program_id)
    data = body.model_dump(exclude_none=True)
    if not data.get("title"):
        raise InvalidStateError("Titre du contenu requis")
    _check_resource(data)
    r = t.ProgramResource(program_id=p.id, created_by=user.full_name, **data)
    db.add(r)
    db.commit()
    return {"id": r.id}


@router.patch("/fiches/{program_id}/ressources/{resource_id}")
def update_resource(program_id: str, resource_id: str, body: ResourceIn, db: DB, _: ProgramWriter) -> dict:
    r = db.get(t.ProgramResource, resource_id)
    if r is None or r.program_id != program_id:
        raise NotFoundError("Contenu introuvable")
    data = body.model_dump(exclude_unset=True)
    _check_resource(data)
    for key, value in data.items():
        setattr(r, key, value)
    db.commit()
    return {"id": r.id}


@router.delete("/fiches/{program_id}/ressources/{resource_id}", status_code=204)
def delete_resource(program_id: str, resource_id: str, db: DB, _: ProgramWriter) -> None:
    r = db.get(t.ProgramResource, resource_id)
    if r is None or r.program_id != program_id:
        raise NotFoundError("Contenu introuvable")
    db.delete(r)
    db.commit()


class ValidateIn(BaseModel):
    note: str | None = None


@router.post("/fiches/{program_id}/versions", status_code=201)
def validate_fiche(program_id: str, body: ValidateIn, db: DB, user: ProgramValidator) -> dict:
    p = fiche.get_program(db, program_id)
    v = fiche.validate_version(db, p, user, body.note)
    db.commit()
    return {"id": v.id, "version": v.version, "sha256": v.sha256}


def _version(db, program_id: str, version_id: str) -> t.ProgramVersion:  # noqa: ANN001
    v = db.get(t.ProgramVersion, version_id)
    if v is None or v.program_id != program_id:
        raise NotFoundError("Version introuvable")
    return v


@router.get("/fiches/{program_id}/versions/{version_id}/programme", response_class=HTMLResponse)
def programme(program_id: str, version_id: str, db: DB, _: ProgramReader, telecharger: bool = False) -> Response:
    """Programme rédigé depuis une version validée (HTML imprimable)."""
    v = _version(db, program_id, version_id)
    html = fiche.render_programme(v)
    headers = {"Content-Disposition": content_disposition(f"Programme {v.snapshot['formation']['code']} v{v.version}.html")} \
        if telecharger else {}
    return HTMLResponse(html, headers=headers)


@router.get("/fiches/{program_id}/versions/{version_id}/apercu-public")
def public_preview(program_id: str, version_id: str, db: DB, _: ProgramReader) -> dict:
    return fiche.public_preview(_version(db, program_id, version_id))


@router.get("/fiches/{program_id}/suivi-pedagogique")
def pedagogy(program_id: str, db: DB, _: ProgramReader) -> dict:
    fiche.get_program(db, program_id)
    return suivi.summary(db, program_id)


# ── Dossiers EDOF ────────────────────────────────────────────────────────────────


@router.get("/edof/referentiel")
def referential(_: EdofReader) -> dict:
    ref = load()
    return {"version": ref.version, "sources": ref.sources, "pieces": [p.model_dump() for p in ref.pieces]}


@router.get("/edof/etablissement")
def get_establishment(db: DB, user: EdofReader) -> dict:
    view = service.establishment_view(db, _perms(db, user))
    db.commit()  # création paresseuse du profil et du dossier de l'établissement
    return view


@router.patch("/edof/etablissement")
def patch_establishment(body: dict, db: DB, user: EdofWriter) -> dict:
    for key in ("identity_checked_on", "nda_checked_on", "qualiopi_checked_on", "obligations_checked_on",
                "cgu_read_on", "qualiopi_valid_until", "efp_connect_updated_on"):
        if body.get(key):
            body[key] = date.fromisoformat(body[key])
    service.update_establishment(db, body, user, _perms(db, user))
    db.commit()
    return service.establishment_view(db, _perms(db, user))


@router.post("/edof/formations/{program_id}/dossier", status_code=201)
def create_formation_dossier(program_id: str, db: DB, user: EdofWriter) -> dict:
    if service.formation_dossier(db, program_id) is not None:
        raise InvalidStateError("Cette formation a déjà un dossier")
    d = service.formation_dossier(db, program_id, create=True, actor=user)
    db.commit()
    return {"id": d.id}


@router.get("/edof/dossiers/{dossier_id}")
def get_dossier(dossier_id: str, db: DB, user: EdofReader) -> dict:
    return service.dossier_view(db, service.get_dossier(db, dossier_id), _perms(db, user))


class TransitionIn(BaseModel):
    on: date | None = None  # date du dépôt, de la demande ou de la décision
    reference: str | None = None
    decision: str | None = None
    note: str | None = None
    items: list[dict] | None = None


@router.post("/edof/dossiers/{dossier_id}/transitions/{action}")
def do_transition(dossier_id: str, action: str, body: TransitionIn, db: DB, user: EdofReader) -> dict:
    d = service.get_dossier(db, dossier_id)
    data = body.model_dump()
    data["date"] = data.pop("on")
    for item in data.get("items") or []:
        if item.get("due_on"):
            item["due_on"] = date.fromisoformat(item["due_on"])
    perms = _perms(db, user)
    service.transition(db, d, action, user, perms, data)
    db.commit()
    return service.dossier_view(db, d, perms)


@router.post("/edof/dossiers/{dossier_id}/pieces/{requirement}")
async def upload(dossier_id: str, requirement: str, db: DB, user: EdofWriter,
                 file: Annotated[UploadFile, File()],
                 issued_on: Annotated[date | None, Form()] = None,
                 valid_until: Annotated[date | None, Form()] = None,
                 siret_on_document: Annotated[str | None, Form()] = None,
                 note: Annotated[str | None, Form()] = None,
                 complement_id: Annotated[str | None, Form()] = None) -> dict:
    d = service.get_dossier(db, dossier_id)
    content = await file.read(storage.MAX_BYTES + 1)
    piece = service.upload_piece(db, d, requirement, content=content, filename=file.filename or requirement,
                                 mime=file.content_type or "", user=user, perms=_perms(db, user),
                                 meta={"issued_on": issued_on, "valid_until": valid_until,
                                       "siret_on_document": siret_on_document, "note": note,
                                       "complement_id": complement_id})
    db.commit()
    return {"id": piece.id, "document_id": piece.document_id}


class LinkIn(BaseModel):
    document_id: str
    issued_on: date | None = None
    valid_until: date | None = None
    siret_on_document: str | None = None
    note: str | None = None
    complement_id: str | None = None


@router.post("/edof/dossiers/{dossier_id}/pieces/{requirement}/lien")
def link(dossier_id: str, requirement: str, body: LinkIn, db: DB, user: EdofWriter) -> dict:
    d = service.get_dossier(db, dossier_id)
    piece = service.link_piece(db, d, requirement, body.document_id, user=user, perms=_perms(db, user),
                               meta=body.model_dump(exclude={"document_id"}))
    db.commit()
    return {"id": piece.id, "document_id": piece.document_id}


@router.get("/edof/documents-reutilisables")
def reusable(db: DB, user: EdofReader, dossier_id: str) -> list[dict]:
    """Documents déjà déposés ailleurs (autres dossiers EDOF, dossiers formateur et organisme) à rattacher."""
    perms = _perms(db, user)
    stmt = select(t.Document).where(t.Document.status != "REMPLACE", t.Document.storage_path.is_not(None),
                                    t.Document.entity_type.in_(("EDOF", "ORGANISME", "FORMATEUR")),
                                    t.Document.entity_id != dossier_id).order_by(t.Document.created_at.desc())
    out = []
    for doc in db.scalars(stmt):
        if doc.kind == "EDOF_SENSIBLE" and "edof.sensitive" not in perms:
            continue
        out.append({"id": doc.id, "title": doc.title, "name": doc.original_name, "owner": doc.entity_type,
                    "version": doc.version, "created_at": doc.created_at})
    return out


class ReviewIn(BaseModel):
    reason: str | None = None


@router.post("/edof/pieces/{piece_id}/valider")
def approve(piece_id: str, db: DB, user: EdofValidator) -> dict:
    p = service.review_piece(db, piece_id, approve=True, reason=None, user=user)
    db.commit()
    return {"id": p.id, "status": p.status}


@router.post("/edof/pieces/{piece_id}/rejeter")
def reject(piece_id: str, body: ReviewIn, db: DB, user: EdofValidator) -> dict:
    p = service.review_piece(db, piece_id, approve=False, reason=body.reason, user=user)
    db.commit()
    return {"id": p.id, "status": p.status}


@router.get("/edof/pieces/{piece_id}/contenu")
def piece_content(piece_id: str, db: DB, user: EdofReader) -> Response:
    piece = db.get(m.Piece, piece_id)
    if piece is None:
        raise NotFoundError("Pièce introuvable")
    doc = db.get(t.Document, piece.document_id)
    if doc.kind == "EDOF_SENSIBLE" and "edof.sensitive" not in _perms(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Pièce sensible : accès réservé")
    if not doc.storage_path:
        raise NotFoundError("Pièce sans fichier")
    content = storage.read(doc.storage_path, expected_sha256=doc.sha256)
    return Response(content, media_type=doc.mime_type,
                    headers={"Content-Disposition": content_disposition((doc.original_name or doc.title).replace('"', "")),
                             "X-Content-SHA256": doc.sha256 or ""})


class AccompanimentIn(BaseModel):
    kind: str | None = None
    label: str | None = None
    planned_on: date | None = None
    done_on: date | None = None
    participant: str | None = None
    note: str | None = None


@router.post("/edof/dossiers/{dossier_id}/accompagnements", status_code=201)
def add_accompaniment(dossier_id: str, body: AccompanimentIn, db: DB, user: EdofWriter) -> dict:
    if not body.label:
        raise InvalidStateError("Libellé requis (ex. webinaire de prise en main EDOF)")
    a = service.add_accompaniment(db, service.get_dossier(db, dossier_id), body.model_dump(), user)
    db.commit()
    return {"id": a.id}


@router.patch("/edof/accompagnements/{accompaniment_id}")
def patch_accompaniment(accompaniment_id: str, body: AccompanimentIn, db: DB, _: EdofWriter) -> dict:
    a = service.update_accompaniment(db, accompaniment_id, body.model_dump(exclude_unset=True))
    db.commit()
    return {"id": a.id}


@router.post("/edof/complements/{complement_id}/clore")
def close_complement(complement_id: str, body: ReviewIn, db: DB, user: EdofWriter) -> dict:
    c = service.cancel_complement(db, complement_id, body.reason or "", user)
    db.commit()
    return {"id": c.id, "status": c.status}
