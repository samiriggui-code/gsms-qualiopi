"""Documents professionnels : création, contenu, vérifications, circuit et archivage.

Tout ce qui s'imprime vient des données enregistrées (organisme, client, formations) ou d'une saisie relue.
Ce qui manque est signalé et bloque la validation ; rien n'est complété d'office.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.platform.decisions import PolicyDenied, deny
from app.application.service.platform.settings import ConfigurationService
from app.application.service.qualiopi.common import next_reference
from app.database.db import utcnow
from app.errors.errors import InvalidStateError, NotFoundError
from app.event.publish import publish
from app.types import training as t
from app.types.editions import KINDS, STATUSES, UNITS, Project, QuoteLine, Step

BUILT = ("DEVIS",)  # types déjà rédigés par l'application ; les autres arrivent par étapes
CENT = Decimal("0.01")
EXEMPTION = "TVA non applicable, article 261, 4, 4° a du code général des impôts."


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def price_to_confirm(program: t.Program) -> bool:
    """Le tarif de la fiche formation est signalé « à confirmer » (import ou saisie à arbitrer)."""
    return any(n.get("champ") == "price_eur" for n in program.review_notes or [])


# ── Création et contenu ──────────────────────────────────────────────────────────────────────


def create(db: Session, *, kind: str, company_id: str, title: str | None, actor: str, actor_id: str | None,
           today: date | None = None) -> Project:
    today = today or date.today()
    if kind not in KINDS:
        raise NotFoundError(f"Type de document inconnu : {kind}")
    if kind not in BUILT:
        raise PolicyDenied(deny("NOT_BUILT", f"{KINDS[kind]} : pas encore disponible dans l'application"))
    company = db.get(t.Company, company_id)
    if company is None:
        raise NotFoundError("Entreprise introuvable")
    if not company.code:
        raise PolicyDenied(deny("CLIENT_CODE_MISSING",
                                f"Donnez d'abord un code client à {company.name} : ses devis seront numérotés avec ce code",
                                [{"cible": "entreprise", "id": company.id}]))
    days = ConfigurationService(db).get("documents.devis_validite_jours", today)
    project = Project(
        reference=next_reference(db, f"DEV-{company.code}", 3), kind=kind, company_id=company.id,
        title=(title or "").strip() or f"{KINDS[kind]} pour {company.name}", status="BROUILLON",
        valid_until=today + timedelta(days=days), author_id=actor_id, created_by=actor,
    )
    db.add(project)
    db.flush()
    publish(db, "edition.created", "edition", project.id, actor_id=actor_id,
            payload={"kind": kind, "reference": project.reference, "company_id": company.id})
    return project


def update(db: Session, project: Project, data: dict, actor_id: str | None) -> Project:
    for key in ("title", "valid_until", "sections"):
        if key in data:
            setattr(project, key, data[key])
    publish(db, "edition.updated", "edition", project.id, actor_id=actor_id, payload={"fields": sorted(data)})
    return project


def replace_lines(db: Session, project: Project, lines: list[dict], actor_id: str | None) -> Project:
    """Remplace toutes les lignes (l'éditeur envoie le tableau entier, dans l'ordre)."""
    for line in lines:
        if line.get("unit", "STAGIAIRE") not in UNITS:
            raise InvalidStateError(f"Unité inconnue : {line['unit']}")
        if line.get("program_id") and db.get(t.Program, line["program_id"]) is None:
            raise NotFoundError("Formation introuvable")
    project.lines.clear()
    db.flush()
    for i, line in enumerate(lines):
        project.lines.append(QuoteLine(position=i, **line))
    db.flush()
    publish(db, "edition.updated", "edition", project.id, actor_id=actor_id, payload={"fields": ["lignes"]})
    return project


# ── Montants et vérifications ─────────────────────────────────────────────────────────────────


def totals(db: Session, project: Project, today: date | None = None) -> dict:
    config = ConfigurationService(db)
    regime = config.get("documents.tva_regime", today)
    lines = []
    total = Decimal(0)
    for line in project.lines:
        amount = None
        if line.unit_price is not None:
            amount = _money(Decimal(line.quantity) * Decimal(line.unit_price) * (1 - Decimal(line.discount_pct) / 100))
            total += amount
        lines.append({"id": line.id, "montant_ht": amount})
    complete = all(x["montant_ht"] is not None for x in lines)
    rate = Decimal(str(config.get("documents.tva_taux", today))) if regime == "ASSUJETTI" else Decimal(0)
    vat = _money(total * rate / 100) if regime != "NON_RENSEIGNE" else None
    return {
        "lignes": lines, "complet": complete, "total_ht": _money(total),
        "tva_regime": regime, "tva_taux": rate if regime == "ASSUJETTI" else None, "tva": vat,
        "total_ttc": _money(total + vat) if vat is not None else None,
        "mention_tva": EXEMPTION if regime == "EXONERE" else None,
    }


def checks(db: Session, project: Project, today: date | None = None) -> list[dict]:
    """Ce qui empêche de valider, avec où le corriger. Liste vide : le document peut être validé."""
    today = today or date.today()
    config = ConfigurationService(db)
    org = db.scalar(select(t.Organization))
    company = db.get(t.Company, project.company_id) if project.company_id else None
    out: list[dict] = []

    def add(code: str, message: str, cible: str, cible_id: str | None = None) -> None:
        out.append({"code": code, "message": message, "cible": cible, "id": cible_id})

    if org is None or not org.siret:
        add("ORG_SIRET", "SIRET de l'organisme manquant", "organisme")
    if not config.get("documents.adresse", today):
        add("ORG_ADDRESS", "Adresse de l'organisme manquante", "parametres")
    if config.get("documents.tva_regime", today) == "NON_RENSEIGNE":
        add("VAT_REGIME", "Régime de TVA de l'organisme non renseigné", "parametres")
    if company is not None and not (company.address and company.postal_code and company.city):
        add("CLIENT_ADDRESS", f"Adresse de {company.name} incomplète", "entreprise", company.id)
    if not project.lines:
        add("NO_LINES", "Aucune ligne au devis", "lignes")
    programs = {p.id: p for p in db.scalars(select(t.Program).where(
        t.Program.id.in_([x.program_id for x in project.lines if x.program_id])))} if project.lines else {}
    for line in project.lines:
        program = programs.get(line.program_id or "")
        if line.unit_price is None:
            add("LINE_PRICE", f"Prix manquant : {line.label}", "lignes", line.id)
        elif (program is not None and price_to_confirm(program) and program.price_eur is not None
              and Decimal(line.unit_price) == Decimal(program.price_eur)):
            add("PRICE_TO_CONFIRM", f"Tarif de {program.code} encore « à confirmer » dans la fiche formation : "
                                    "le confirmer ou saisir le prix convenu", "formation", program.id)
    if project.valid_until is None or project.valid_until < today:
        add("VALIDITY", "Date de validité absente ou dépassée", "document")
    return out


# ── Circuit ──────────────────────────────────────────────────────────────────────────────────


def record(db: Session, project: Project, action: str, to_status: str, actor: str, actor_id: str | None,
           note: str | None = None) -> None:
    step = Step(action=action, from_status=project.status, to_status=to_status, done_by=actor, done_at=utcnow(),
                note=note, version=project.version or None)
    project.steps.append(step)
    project.status = to_status
    db.flush()
    publish(db, f"edition.{action}", "edition", project.id, actor_id=actor_id,
            payload={"reference": project.reference, "statut": to_status, "version": project.version})


def status_label(status: str) -> str:
    return STATUSES.get(status, status)
