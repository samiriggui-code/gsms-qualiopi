"""Rédaction des factures et avoirs (Jinja, A4) et archivage de la pièce émise (empreinte SHA-256).

Le texte imprimé vient des données enregistrées et des réglages en vigueur le jour de l'émission ; une fois émise,
la pièce est servie telle qu'archivée (empreinte vérifiée à chaque lecture), jamais rédigée à nouveau.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.documents import storage
from app.application.service.editions.rendu import TEMPLATES_DIR, euros
from app.application.service.invoicing import service
from app.application.service.journey.documents import _store as store_generated
from app.application.service.platform.settings import ConfigurationService
from app.common.rendu_a4 import css_string, date_fr, logo_css
from app.errors.errors import NotFoundError
from app.types import training as t
from app.types.editions import UNITS
from app.types.invoicing import KINDS, PROFESSIONAL_CLIENTS, Invoice

ENTITY = "FACTURE"  # formation.document.entity_type des pièces émises

_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(["html"]),
                   undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)


def eur(value_cents: int) -> str:
    return euros(Decimal(value_cents) / 100) or ""


def _number(value: Decimal) -> str:
    return f"{Decimal(value).normalize():f}".replace(".", ",")


def _d(value: date | None) -> str | None:
    return date_fr(value.isoformat()) if value else None


def _context(db: Session, invoice: Invoice, today: date) -> dict:
    config = ConfigurationService(db)
    org = db.scalar(select(t.Organization))
    credited = db.get(Invoice, invoice.credited_invoice_id) if invoice.credited_invoice_id else None
    groups = invoice.vat_breakdown or []  # tenu à jour par `service.recompute` (brouillon) puis figé
    organisme = {
        "nom": org.name if org else "Organisme de formation", "siret": org.siret if org else None,
        "nda": org.nda_number if org else None, "adresse": config.get("documents.adresse", today),
        "telephone": config.get("documents.telephone", today), "email": config.get("documents.email", today),
        "forme": config.get("facturation.forme_juridique", today),
        "tva": config.get("facturation.numero_tva", today),
    }
    label = KINDS[invoice.kind]
    reference = invoice.number or "numéro attribué à l'émission"
    return {
        "organisme": organisme,
        "client": {"nom": invoice.client_name, "adresse": invoice.client_address,
                   "code_postal": invoice.client_postal_code, "ville": invoice.client_city,
                   "siret": invoice.client_siret},
        "piece": {
            "type": label, "titre": invoice.title, "numero": reference, "date": _d(invoice.issued_on or today),
            "prestation_du": _d(invoice.service_from), "prestation_au": _d(invoice.service_to),
            "echeance": _d(invoice.due_on) if invoice.kind == "FACTURE" else None,
            "bon_commande": invoice.purchase_order, "motif": invoice.reason,
            "facture_origine": {"numero": credited.number, "date": _d(credited.issued_on)} if credited else None,
        },
        "lignes": [{
            "libelle": x.label, "detail": x.detail, "quantite": _number(x.quantity),
            "unite": UNITS.get(x.unit, x.unit) + ("s" if Decimal(x.quantity) > 1 else ""),
            "prix": eur(x.unit_price_cents), "remise": f"{_number(x.discount_pct)} %" if x.discount_pct else None,
            "tva": f"{_number(x.vat_rate)} %" if x.vat_rate is not None else "Exonérée",
            "montant": eur(x.amount_ht_cents),
        } for x in invoice.lines],
        "taux": [{"taux": f"{_number(Decimal(g['taux']))} %" if g["taux"] else None, "base": eur(g["base"]),
                  "tva": eur(g["tva"])} for g in groups],
        "totaux": {"ht": eur(sum(g["base"] for g in groups)), "tva": eur(sum(g["tva"] for g in groups)),
                   "ttc": eur(sum(g["base"] + g["tva"] for g in groups))},
        "mention_tva": service.mention_vat(invoice),
        "professionnel": invoice.client_kind in PROFESSIONAL_CLIENTS and invoice.kind == "FACTURE",
        "penalites": config.get("facturation.taux_penalites", today),
        "escompte": config.get("facturation.escompte", today),
        "banque": config.get("facturation.coordonnees_bancaires", today),
        "conditions": config.get("documents.conditions_paiement", today),
        "mentions": config.get("documents.mentions", today),
        "empreinte_note": (f"{label} émis le {_d(invoice.issued_on)}. L'empreinte SHA-256 de ce fichier est "
                           "conservée par l'organisme : toute modification du fichier la change.")
        if invoice.issued_on else None,
        "couleur": config.get("general.brand_color", today),
        "logo_css": logo_css(),
        "titre_page": f"{label} {reference}",
        "entete_css": css_string(f"{label} {reference}"),
        "pied_css": css_string(" · ".join(x for x in (
            organisme["nom"], f"SIRET {organisme['siret']}" if organisme["siret"] else None,
            f"NDA {organisme['nda']}" if organisme["nda"] else None) if x)),
    }


def render(db: Session, invoice: Invoice, today: date | None = None, *, watermark: str | None = None) -> str:
    return _env.get_template("facture.html").render(**_context(db, invoice, today or date.today()),
                                                    filigrane=watermark)


def archive(db: Session, invoice: Invoice, actor: str, actor_id: str | None, today: date) -> t.Document:
    content = render(db, invoice, today).encode("utf-8")
    digest, relative = store_generated(content)
    doc = t.Document(
        kind=invoice.kind, title=f"{KINDS[invoice.kind]} {invoice.number} — {invoice.client_name}"[:250],
        entity_type=ENTITY, entity_id=invoice.id, version=1, status="EMIS", author_id=actor_id,
        mime_type="text/html; charset=utf-8", storage_path=relative, sha256=digest, size_bytes=len(content),
        original_name=f"{invoice.number}.html", indicator_hints=[], support="GENERE", created_by=actor)
    db.add(doc)
    db.flush()
    return doc


def frozen(db: Session, invoice: Invoice) -> tuple[bytes, str]:
    """Contenu archivé de la pièce émise et son empreinte (vérifiée à la lecture)."""
    doc = db.get(t.Document, invoice.document_id) if invoice.document_id else None
    if doc is None or doc.entity_type != ENTITY or doc.entity_id != invoice.id or not doc.storage_path:
        raise NotFoundError("Pièce archivée introuvable")
    return storage.read(doc.storage_path, expected_sha256=doc.sha256), doc.sha256 or ""
