"""Rédaction des documents professionnels (Jinja, A4) et archivage des versions validées."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.editions import service
from app.application.service.journey.documents import _store as store_generated
from app.application.service.platform.settings import ConfigurationService
from app.common.rendu_a4 import css_string, date_fr, logo_css
from app.config.config import BACKEND_DIR
from app.types import training as t
from app.types.editions import KINDS, UNITS, Project

TEMPLATES_DIR = BACKEND_DIR / "config" / "documents_pro"
TEMPLATES = {"DEVIS": "devis.html"}
ENTITY = "EDITION"  # formation.document.entity_type des versions archivées

_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(["html"]),
                   undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)


def euros(value: Decimal | None) -> str | None:
    """« 1 234,50 € » (espace fine insécable pour les milliers)."""
    if value is None:
        return None
    text = f"{Decimal(value):,.2f}".replace(",", " ").replace(".", ",")
    return f"{text} €"


def _number(value: Decimal) -> str:
    q = Decimal(value).normalize()
    return f"{q:f}".replace(".", ",")


def _context(db: Session, project: Project, today: date, version: int | None) -> dict:
    config = ConfigurationService(db)
    org = db.scalar(select(t.Organization))
    company = db.get(t.Company, project.company_id) if project.company_id else None
    programs = {p.id: p for p in db.scalars(select(t.Program).where(
        t.Program.id.in_([x.program_id for x in project.lines if x.program_id])))} if project.lines else {}
    money = service.totals(db, project, today)
    amounts = {x["id"]: x["montant_ht"] for x in money["lignes"]}
    organisme = {
        "nom": org.name if org else "Organisme de formation", "siret": org.siret if org else None,
        "nda": org.nda_number if org else None, "adresse": config.get("documents.adresse", today),
        "telephone": config.get("documents.telephone", today), "email": config.get("documents.email", today),
    }
    return {
        "organisme": organisme,
        "client": {
            "nom": company.name, "code": company.code, "siret": company.siret, "adresse": company.address,
            "code_postal": company.postal_code, "ville": company.city, "contact": company.contact_name,
            "fonction": company.contact_role,
        } if company else None,
        "document": {
            "titre": project.title, "reference": project.reference, "date": date_fr(today.isoformat()),
            "valide_jusqu_au": date_fr(project.valid_until.isoformat()) if project.valid_until else None,
            "version": version,
            "empreinte_note": (f"Version {version} validée le {date_fr(today.isoformat())}. L'empreinte SHA-256 de ce "
                               "fichier est conservée par l'organisme : toute modification du fichier la change.")
            if version else None,
        },
        "sections": [s for s in project.sections or [] if (s.get("titre") or "").strip()],
        "lignes": [{
            "libelle": x.label, "detail": x.detail,
            "formation": (f"Formation {programs[x.program_id].code}" if x.label == programs[x.program_id].title
                          else f"Formation {programs[x.program_id].code} · {programs[x.program_id].title}")
            if x.program_id in programs else None,
            "quantite": _number(x.quantity), "unite": UNITS.get(x.unit, x.unit) + ("s" if Decimal(x.quantity) > 1 else ""),
            "prix": euros(x.unit_price), "remise": f"{_number(x.discount_pct)} %" if x.discount_pct else None,
            "montant": euros(amounts.get(x.id)),
        } for x in project.lines],
        "totaux": {"ht": euros(money["total_ht"]), "regime": money["tva_regime"],
                   "taux": _number(money["tva_taux"]) if money["tva_taux"] is not None else None,
                   "tva": euros(money["tva"]), "ttc": euros(money["total_ttc"]), "mention": money["mention_tva"]},
        "conditions": config.get("documents.conditions_paiement", today),
        "mentions": config.get("documents.mentions", today),
        "couleur": config.get("general.brand_color", today),
        "logo_css": logo_css(),
        "titre_page": f"{KINDS[project.kind]} {project.reference}",
        "entete_css": css_string(f"{KINDS[project.kind]} {project.reference}"),
        "pied_css": css_string(" · ".join(x for x in (
            organisme["nom"], f"NDA {organisme['nda']}" if organisme["nda"] else None,
            f"SIRET {organisme['siret']}" if organisme["siret"] else None) if x)),
    }


def render(db: Session, project: Project, today: date | None = None, *, version: int | None = None,
           watermark: str | None = None) -> str:
    today = today or date.today()
    return _env.get_template(TEMPLATES[project.kind]).render(
        **_context(db, project, today, version), filigrane=watermark)


def archive(db: Session, project: Project, actor: str, actor_id: str | None, today: date | None = None) -> t.Document:
    """Rédige la version validée, la range par empreinte et remplace la précédente dans l'archive."""
    version = project.version + 1
    content = render(db, project, today, version=version).encode("utf-8")
    digest, relative = store_generated(content)
    previous = db.get(t.Document, project.document_id) if project.document_id else None
    doc = t.Document(
        kind=project.kind, title=f"{KINDS[project.kind]} {project.reference} — {project.title}",
        entity_type=ENTITY, entity_id=project.id, version=version,
        previous_version_id=previous.id if previous else None, status="EMIS", author_id=actor_id,
        mime_type="text/html; charset=utf-8", storage_path=relative, sha256=digest, size_bytes=len(content),
        original_name=f"{project.reference}-v{version}.html", indicator_hints=[], support="GENERE",
        created_by=actor,
    )
    if previous is not None and previous.status != "REMPLACE":
        previous.status = "REMPLACE"
    db.add(doc)
    db.flush()
    project.version = version
    project.document_id = doc.id
    return doc


def versions(db: Session, project: Project) -> list[t.Document]:
    return list(db.scalars(select(t.Document).where(t.Document.entity_type == ENTITY, t.Document.entity_id == project.id)
                           .order_by(t.Document.version.desc())))
