"""API des documents professionnels : `/api/v1/editions`."""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.application.access.editions import ACTIONS, EditionPolicy
from app.application.service.documents import storage
from app.application.service.editions import rendu, service
from app.application.service.platform.decisions import enforce
from app.errors.errors import InvalidStateError, NotFoundError
from app.middleware.auth import DB, require
from app.types import training as t
from app.types.auth import User
from app.types.editions import KINDS, STATUSES, UNITS, Project, Step

router = APIRouter(prefix="/api/v1/editions", tags=["Documents professionnels"])
Reader = Annotated[User, Depends(require("documents.read"))]
Writer = Annotated[User, Depends(require("documents.write"))]


def _project(db, project_id: str) -> Project:  # noqa: ANN001
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Document introuvable")
    return project


def _money(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _summary(project: Project, companies: dict[str, t.Company], today: date) -> dict:
    company = companies.get(project.company_id or "")
    return {
        "id": project.id, "reference": project.reference, "type": project.kind, "type_libelle": KINDS[project.kind],
        "titre": project.title, "statut": project.status, "statut_libelle": STATUSES[project.status],
        "client": {"id": company.id, "nom": company.name, "code": company.code} if company else None,
        "version": project.version, "valide_jusqu_au": project.valid_until.isoformat() if project.valid_until else None,
        "expire": bool(project.valid_until and project.valid_until < today and project.status in ("VALIDE", "ENVOYE")),
        "envoye_le": project.sent_on.isoformat() if project.sent_on else None,
        "cree_le": project.created_at.isoformat(), "modifie_le": project.updated_at.isoformat(),
        "par": project.created_by,
    }


def _companies(db, projects: list[Project]) -> dict[str, t.Company]:  # noqa: ANN001
    ids = {p.company_id for p in projects if p.company_id}
    return {c.id: c for c in db.scalars(select(t.Company).where(t.Company.id.in_(ids)))} if ids else {}


def _detail(db, project: Project, user: User, today: date) -> dict:  # noqa: ANN001
    issues = service.checks(db, project, today)
    money = service.totals(db, project, today)
    amounts = {x["id"]: x["montant_ht"] for x in money["lignes"]}
    company = db.get(t.Company, project.company_id) if project.company_id else None
    programs = {p.id: p for p in db.scalars(select(t.Program).where(
        t.Program.id.in_([x.program_id for x in project.lines if x.program_id])))} if project.lines else {}
    return {
        **_summary(project, _companies(db, [project]), today),
        "client": {"id": company.id, "nom": company.name, "code": company.code, "siret": company.siret,
                   "adresse": company.address, "code_postal": company.postal_code, "ville": company.city,
                   "contact": company.contact_name, "email": company.contact_email} if company else None,
        "sections": project.sections or [],
        "lignes": [{
            "id": x.id, "formation_id": x.program_id,
            "formation": {"code": programs[x.program_id].code, "titre": programs[x.program_id].title,
                          "prix_a_confirmer": service.price_to_confirm(programs[x.program_id])}
            if x.program_id in programs else None,
            "libelle": x.label, "detail": x.detail, "quantite": float(x.quantity), "unite": x.unit,
            "prix_unitaire": _money(x.unit_price), "remise_pct": float(x.discount_pct),
            "montant_ht": _money(amounts.get(x.id)),
        } for x in project.lines],
        "totaux": {"total_ht": _money(money["total_ht"]), "tva_regime": money["tva_regime"],
                   "tva_taux": _money(money["tva_taux"]), "tva": _money(money["tva"]),
                   "total_ttc": _money(money["total_ttc"]), "complet": money["complet"],
                   "mention_tva": money["mention_tva"]},
        "verifications": issues,
        "historique": [{"action": s.action, "de": STATUSES[s.from_status], "vers": STATUSES[s.to_status],
                        "par": s.done_by, "le": s.done_at.isoformat(), "motif": s.note, "version": s.version}
                       for s in reversed(project.steps)],
        "versions": [{"id": d.id, "version": d.version, "statut": d.status, "sha256": d.sha256,
                      "emis_le": d.created_at.isoformat(), "par": d.created_by} for d in rendu.versions(db, project)],
        "capabilities": EditionPolicy(db, user, today).capabilities(project, issues),
    }


# ── Lectures ──────────────────────────────────────────────────────────────────────────────────


@router.get("/types")
def kinds(_: Reader) -> dict:
    return {"types": [{"code": k, "libelle": v, "disponible": k in service.BUILT} for k, v in KINDS.items()],
            "statuts": STATUSES, "unites": UNITS}


@router.get("")
def list_projects(db: DB, _: Reader) -> list[dict]:
    today = date.today()
    rows = list(db.scalars(select(Project).order_by(Project.updated_at.desc())))
    companies = _companies(db, rows)
    return [_summary(p, companies, today) for p in rows]


def _month_start(today: date, back: int) -> date:
    """1er du mois, `back` mois calendaires avant celui de `today` (des pas de 31 jours sautaient février)."""
    year, month = divmod(today.year * 12 + today.month - 1 - back, 12)
    return date(year, month + 1, 1)


@router.get("/synthese")
def overview(db: DB, _: Reader) -> dict:
    """Chiffres de l'accueil du module : tout est compté sur les documents enregistrés."""
    today = date.today()
    rows = list(db.scalars(select(Project)))
    companies = _companies(db, rows)
    by_status = Counter(p.status for p in rows)
    by_kind = Counter(p.kind for p in rows)
    months = [_month_start(today, back) for back in range(5, -1, -1)]
    validated = Counter(s.done_at.date().strftime("%Y-%m") for s in db.scalars(select(Step).where(Step.action == "valider")))
    alerts = []
    for p in rows:
        if p.status in ("VALIDE", "ENVOYE") and p.valid_until and p.valid_until <= today + timedelta(days=7):
            alerts.append({"niveau": "danger" if p.valid_until < today else "warning",
                           "message": f"{p.reference} : validité {'dépassée' if p.valid_until < today else 'bientôt échue'}",
                           "id": p.id})
        elif p.status == "EN_RELECTURE":
            alerts.append({"niveau": "info", "message": f"{p.reference} attend sa relecture", "id": p.id})
        elif p.status == "BROUILLON":
            issues = service.checks(db, p, today)
            if issues:
                alerts.append({"niveau": "warning", "message": f"{p.reference} : {issues[0]['message']}"
                               + (f" (+{len(issues) - 1})" if len(issues) > 1 else ""), "id": p.id})
    recent = sorted(rows, key=lambda p: p.updated_at, reverse=True)[:6]
    return {
        "total": len(rows),
        "statuts": {k: by_status.get(k, 0) for k in STATUSES},
        "types": [{"code": k, "libelle": KINDS[k], "nombre": n} for k, n in by_kind.most_common()],
        "valides_par_mois": [{"mois": m.strftime("%Y-%m"), "nombre": validated.get(m.strftime("%Y-%m"), 0)} for m in months],
        "alertes": alerts,
        "recents": [_summary(p, companies, today) for p in recent],
    }


@router.get("/formations")
def programs(db: DB, _: Reader) -> list[dict]:
    """Formations proposables dans un devis, avec leur tarif et s'il reste à confirmer."""
    return [{"id": p.id, "code": p.code, "titre": p.title, "prix": _money(p.price_eur),
             "prix_a_confirmer": service.price_to_confirm(p),
             "duree_heures": _money(p.duration_hours)} for p in db.scalars(select(t.Program).order_by(t.Program.code))]


@router.get("/clients")
def clients(db: DB, _: Reader) -> list[dict]:
    return [{"id": c.id, "nom": c.name, "code": c.code, "adresse_complete": bool(c.address and c.postal_code and c.city)}
            for c in db.scalars(select(t.Company).order_by(t.Company.name))]


@router.get("/{project_id}")
def get_project(project_id: str, db: DB, user: Reader) -> dict:
    return _detail(db, _project(db, project_id), user, date.today())


@router.get("/{project_id}/apercu", response_class=HTMLResponse)
def preview(project_id: str, db: DB, _: Reader) -> HTMLResponse:
    """Aperçu imprimable du contenu actuel ; filigrane tant qu'il n'est pas validé."""
    project = _project(db, project_id)
    if project.status in ("VALIDE", "ENVOYE", "ARCHIVE") and project.document_id:
        return HTMLResponse(_content(db, project, project.document_id))
    mark = "Brouillon · non validé" if project.status != "ABANDONNE" else "Abandonné"
    return HTMLResponse(rendu.render(db, project, watermark=mark))


def _content(db, project: Project, document_id: str) -> bytes:  # noqa: ANN001
    doc = db.get(t.Document, document_id)
    if doc is None or doc.entity_type != rendu.ENTITY or doc.entity_id != project.id or not doc.storage_path:
        raise NotFoundError("Version introuvable")
    return storage.read(doc.storage_path, expected_sha256=doc.sha256)


@router.get("/{project_id}/versions/{document_id}")
def version_content(project_id: str, document_id: str, db: DB, _: Reader) -> Response:
    """Une version validée, telle qu'archivée (empreinte vérifiée à la lecture)."""
    content = _content(db, _project(db, project_id), document_id)
    return Response(content, media_type="text/html; charset=utf-8")


# ── Écritures ─────────────────────────────────────────────────────────────────────────────────


class CreateIn(BaseModel):
    type: str = "DEVIS"
    client_id: str
    titre: str | None = None


@router.post("", status_code=201)
def create_project(body: CreateIn, db: DB, user: Writer) -> dict:
    project = service.create(db, kind=body.type, company_id=body.client_id, title=body.titre,
                             actor=user.full_name, actor_id=user.id)
    db.commit()
    return _detail(db, project, user, date.today())


class SectionIn(BaseModel):
    titre: str = Field(max_length=200)
    texte: str = Field(default="", max_length=5000)


class UpdateIn(BaseModel):
    titre: str | None = Field(default=None, min_length=1, max_length=250)
    valide_jusqu_au: date | None = None
    sections: list[SectionIn] | None = None


@router.patch("/{project_id}")
def update_project(project_id: str, body: UpdateIn, db: DB, user: Writer) -> dict:
    project = _project(db, project_id)
    enforce(EditionPolicy(db, user).can_edit(project))
    data = body.model_dump(exclude_unset=True)
    mapped = {{"titre": "title", "valide_jusqu_au": "valid_until"}.get(k, k): v for k, v in data.items()}
    service.update(db, project, mapped, user.id)
    db.commit()
    return _detail(db, project, user, date.today())


class LineIn(BaseModel):
    formation_id: str | None = None
    libelle: str = Field(min_length=1, max_length=300)
    detail: str | None = Field(default=None, max_length=2000)
    quantite: Decimal = Field(default=Decimal(1), gt=0, le=100000)
    unite: str = "STAGIAIRE"
    prix_unitaire: Decimal | None = Field(default=None, ge=0, le=10_000_000)
    remise_pct: Decimal = Field(default=Decimal(0), ge=0, le=100)


@router.put("/{project_id}/lignes")
def put_lines(project_id: str, body: list[LineIn], db: DB, user: Writer) -> dict:
    project = _project(db, project_id)
    enforce(EditionPolicy(db, user).can_edit(project))
    service.replace_lines(db, project, [{
        "program_id": x.formation_id, "label": x.libelle.strip(), "detail": x.detail, "quantity": x.quantite,
        "unit": x.unite, "unit_price": x.prix_unitaire, "discount_pct": x.remise_pct,
    } for x in body], user.id)
    db.commit()
    db.refresh(project)
    return _detail(db, project, user, date.today())


class ActionIn(BaseModel):
    motif: str | None = Field(default=None, max_length=2000)
    date_envoi: date | None = None


@router.post("/{project_id}/actions/{action}")
def act(project_id: str, action: str, body: ActionIn, db: DB, user: Reader) -> dict:
    """Fait avancer le circuit. La permission et l'état sont jugés par la politique (refus motivé)."""
    project = _project(db, project_id)
    today = date.today()
    enforce(EditionPolicy(db, user, today).decide(project, action))
    _, _, target, inputs = ACTIONS[action]
    if "motif" in inputs and not (body.motif or "").strip():
        raise InvalidStateError("Indiquez le motif")
    if action == "valider":
        rendu.archive(db, project, user.full_name, user.id, today)
    if action == "envoyer":
        sent = body.date_envoi or today
        if sent > today:
            raise InvalidStateError("La date d'envoi ne peut pas être dans le futur")
        project.sent_on = sent
    if action == "reprendre":
        project.sent_on = None
    service.record(db, project, action, target, user.full_name, user.id,
                   note=(body.motif or "").strip() or (f"Envoyé le {project.sent_on:%d/%m/%Y}" if action == "envoyer" else None))
    db.commit()
    return _detail(db, project, user, today)
