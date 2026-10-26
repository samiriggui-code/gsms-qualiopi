"""API de la facturation : `/api/v1/factures` (factures et avoirs) et `/api/v1/encaissements`.

Les montants sont échangés en centimes entiers (`*_centimes`) : jamais de nombre à virgule flottante.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.application.access.invoicing import InvoicePolicy
from app.application.service.invoicing import rendu, service
from app.application.service.platform.decisions import enforce
from app.errors.errors import InvalidStateError, NotFoundError
from app.middleware.auth import DB, require
from app.types.auth import User
from app.types.editions import UNITS
from app.types.invoicing import CLIENT_KINDS, KINDS, PAYMENT_MODES, STATUSES, Invoice, Payment

router = APIRouter(prefix="/api/v1", tags=["Facturation"])
Reader = Annotated[User, Depends(require("invoices.read"))]
Writer = Annotated[User, Depends(require("invoices.write"))]
Issuer = Annotated[User, Depends(require("invoices.issue"))]
Cashier = Annotated[User, Depends(require("payments.write"))]


def _get(db, invoice_id: str) -> Invoice:  # noqa: ANN001
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise NotFoundError("Facture introuvable")
    return invoice


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _summary(db, invoice: Invoice, today: date) -> dict:  # noqa: ANN001
    b = service.balance(db, invoice)
    return {
        "id": invoice.id, "type": invoice.kind, "type_libelle": KINDS[invoice.kind], "numero": invoice.number,
        "titre": invoice.title, "statut": invoice.status, "statut_libelle": STATUSES[invoice.status],
        "client": {"type": invoice.client_kind, "type_libelle": CLIENT_KINDS[invoice.client_kind],
                   "nom": invoice.client_name, "entreprise_id": invoice.company_id, "stagiaire_id": invoice.learner_id},
        "emise_le": _iso(invoice.issued_on), "echeance": _iso(invoice.due_on),
        "en_retard": service.is_overdue(db, invoice, today), "facture_origine_id": invoice.credited_invoice_id,
        "total_ht_centimes": invoice.total_ht_cents, "total_tva_centimes": invoice.total_vat_cents,
        "total_ttc_centimes": invoice.total_ttc_cents, "avoirs_centimes": b["avoirs"],
        "encaisse_centimes": b["encaisse"], "reste_du_centimes": b["reste_du"], "trop_percu_centimes": b["trop_percu"],
        "cree_le": invoice.created_at.isoformat(), "par": invoice.created_by,
    }


def _payment(p: Payment, policy: InvoicePolicy | None = None) -> dict:
    out = {"id": p.id, "facture_id": p.invoice_id, "montant_centimes": p.amount_cents, "date": p.received_on.isoformat(),
           "mode": p.mode, "mode_libelle": PAYMENT_MODES.get(p.mode, p.mode), "reference": p.reference, "note": p.note,
           "par": p.created_by, "annule": p.cancelled_at is not None,
           "annule_le": p.cancelled_at.isoformat() if p.cancelled_at else None, "annule_par": p.cancelled_by,
           "motif_annulation": p.cancel_reason}
    if policy is not None:
        out["capabilities"] = {"annuler": policy.can_cancel_payment(p).to_dict()}
    return out


def _detail(db, invoice: Invoice, user: User, today: date) -> dict:  # noqa: ANN001
    policy = InvoicePolicy(db, user, today)
    issues = service.checks(db, invoice, today) if invoice.status == "BROUILLON" else []
    doc = None
    if invoice.document_id:
        from app.types import training as t

        d = db.get(t.Document, invoice.document_id)
        doc = {"id": d.id, "sha256": d.sha256, "emis_le": d.created_at.isoformat()} if d else None
    credited = service.credited_by_line(db, invoice) if invoice.kind == "FACTURE" else {}
    history = [{"action": "creation", "le": invoice.created_at.isoformat(), "par": invoice.created_by}]
    if invoice.issued_at:
        history.append({"action": "emission", "le": invoice.issued_at.isoformat(), "par": invoice.issued_by,
                        "numero": invoice.number})
    notes = service.credit_notes(db, invoice) if invoice.kind == "FACTURE" else []
    history += [{"action": "avoir", "le": a.issued_at.isoformat() if a.issued_at else None, "par": a.issued_by,
                 "numero": a.number, "montant_centimes": a.total_ttc_cents} for a in notes]
    for p in invoice.payments:
        history.append({"action": "encaissement", "le": p.created_at.isoformat(), "par": p.created_by,
                        "montant_centimes": p.amount_cents})
        if p.cancelled_at:
            history.append({"action": "annulation_encaissement", "le": p.cancelled_at.isoformat(),
                            "par": p.cancelled_by, "motif": p.cancel_reason})
    summary = _summary(db, invoice, today)
    return {
        **summary,
        "client": {**summary["client"], "adresse": invoice.client_address,
                   "code_postal": invoice.client_postal_code, "ville": invoice.client_city,
                   "siret": invoice.client_siret},
        "bon_commande": invoice.purchase_order, "prestation_du": _iso(invoice.service_from),
        "prestation_au": _iso(invoice.service_to), "note": invoice.note, "motif": invoice.reason,
        "devis_id": invoice.quote_id, "financement_source_id": invoice.funding_source_id,
        "lignes": [{
            "id": x.id, "libelle": x.label, "detail": x.detail, "quantite": str(x.quantity), "unite": x.unit,
            "prix_unitaire_centimes": x.unit_price_cents, "remise_pct": str(x.discount_pct),
            "tva_taux": str(x.vat_rate) if x.vat_rate is not None else None, "exoneree": x.vat_rate is None,
            "montant_ht_centimes": x.amount_ht_cents, "formation_id": x.program_id, "session_id": x.session_id,
            "inscription_id": x.enrollment_id, "ligne_facture_id": x.credited_line_id,
            "credite_centimes": credited.get(x.id, 0),
        } for x in invoice.lines],
        "tva": [{"taux": g["taux"], "base_centimes": g["base"], "tva_centimes": g["tva"]}
                for g in invoice.vat_breakdown or []],
        "mention_tva": service.mention_vat(invoice),
        "verifications": issues,
        "avoirs": [_summary(db, a, today) for a in notes],
        "encaissements": [_payment(p, policy) for p in invoice.payments],
        "document": doc,
        "historique": sorted(history, key=lambda h: h["le"] or ""),
        "capabilities": policy.capabilities(invoice, issues),
    }


# ── Lectures ──────────────────────────────────────────────────────────────────────────────────


@router.get("/factures/references")
def references(_: Reader) -> dict:
    return {"types": KINDS, "statuts": STATUSES, "clients": CLIENT_KINDS, "modes_paiement": PAYMENT_MODES,
            "unites": UNITS}


@router.get("/factures")
def list_invoices(db: DB, _: Reader, type: Literal["FACTURE", "AVOIR"] | None = None,  # noqa: A002
                  statut: str | None = None, en_retard: bool = False,
                  q: Annotated[str | None, Query(max_length=100)] = None) -> list[dict]:
    today = date.today()
    stmt = select(Invoice).order_by(Invoice.issued_on.desc().nulls_first(), Invoice.created_at.desc())
    if type:
        stmt = stmt.where(Invoice.kind == type)
    if statut:
        stmt = stmt.where(Invoice.status == statut)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Invoice.number.ilike(like) | Invoice.client_name.ilike(like) | Invoice.title.ilike(like))
    rows = [_summary(db, x, today) for x in db.scalars(stmt)]
    return [r for r in rows if r["en_retard"]] if en_retard else rows


@router.get("/factures/synthese")
def overview(db: DB, _: Reader) -> dict:
    """Chiffres de l'accueil Factures et encaissements, comptés sur les pièces enregistrées."""
    today = date.today()
    invoices = list(db.scalars(select(Invoice).where(Invoice.kind == "FACTURE")))
    summaries = [_summary(db, x, today) for x in invoices]
    month = today.replace(day=1)
    received = db.scalars(select(Payment).where(Payment.cancelled_at.is_(None), Payment.received_on >= month))
    late = sorted((s for s in summaries if s["en_retard"]), key=lambda s: s["echeance"] or "")
    soon = [s for s in summaries if not s["en_retard"] and s["reste_du_centimes"] > 0 and s["echeance"]
            and s["echeance"] <= (today + timedelta(days=7)).isoformat()]
    return {
        "brouillons": sum(1 for s in summaries if s["statut"] == "BROUILLON"),
        "statuts": {k: sum(1 for s in summaries if s["statut"] == k) for k in STATUSES},
        "a_encaisser_centimes": sum(s["reste_du_centimes"] for s in summaries),
        "en_retard_centimes": sum(s["reste_du_centimes"] for s in late),
        "encaisse_ce_mois_centimes": sum(p.amount_cents for p in received),
        "alertes": [{"niveau": "danger", "id": s["id"],
                     "message": f"{s['numero']} ({s['client']['nom']}) : échéance du {s['echeance']} dépassée"}
                    for s in late]
                   + [{"niveau": "warning", "id": s["id"],
                       "message": f"{s['numero']} ({s['client']['nom']}) : échéance le {s['echeance']}"} for s in soon]
                   + [{"niveau": "info", "id": s["id"],
                       "message": f"{s['numero']} : trop-perçu à rembourser au client"}
                      for s in summaries if s["trop_percu_centimes"] > 0],
    }


@router.get("/factures/{invoice_id}")
def get_invoice(invoice_id: str, db: DB, user: Reader) -> dict:
    return _detail(db, _get(db, invoice_id), user, date.today())


@router.get("/factures/{invoice_id}/apercu", response_class=HTMLResponse)
def preview(invoice_id: str, db: DB, _: Reader) -> Response:
    """Pièce émise : le fichier archivé (empreinte vérifiée). Brouillon : aperçu avec filigrane, sans numéro."""
    invoice = _get(db, invoice_id)
    if invoice.status != "BROUILLON":
        content, digest = rendu.frozen(db, invoice)
        return Response(content, media_type="text/html; charset=utf-8", headers={"X-Content-SHA256": digest})
    return HTMLResponse(rendu.render(db, invoice, watermark="Brouillon · sans valeur"))


@router.get("/encaissements")
def list_payments(db: DB, _: Reader, du: date | None = None, au: date | None = None,
                  annules: bool = False) -> list[dict]:
    stmt = select(Payment).order_by(Payment.received_on.desc(), Payment.created_at.desc())
    if du:
        stmt = stmt.where(Payment.received_on >= du)
    if au:
        stmt = stmt.where(Payment.received_on <= au)
    if not annules:
        stmt = stmt.where(Payment.cancelled_at.is_(None))
    out = []
    for p in db.scalars(stmt):
        row = _payment(p)
        row["facture"] = {"numero": p.invoice.number, "client": p.invoice.client_name}
        out.append(row)
    return out


# ── Brouillons ────────────────────────────────────────────────────────────────────────────────


class FunderIn(BaseModel):
    nom: str = Field(min_length=1, max_length=200)
    adresse: str | None = Field(default=None, max_length=300)
    code_postal: str | None = Field(default=None, max_length=10)
    ville: str | None = Field(default=None, max_length=120)
    siret: str | None = Field(default=None, max_length=20)


class CreateIn(BaseModel):
    client_type: Literal["ENTREPRISE", "STAGIAIRE", "FINANCEUR"]
    entreprise_id: str | None = None
    stagiaire_id: str | None = None
    financeur: FunderIn | None = None
    titre: str | None = Field(default=None, max_length=250)
    devis_id: str | None = None
    session_id: str | None = None
    inscription_ids: list[str] | None = Field(default=None, max_length=200)
    financement_source_id: str | None = None


@router.post("/factures", status_code=201)
def create_invoice(body: CreateIn, db: DB, user: Writer) -> dict:
    invoice = service.create(
        db, client_kind=body.client_type, company_id=body.entreprise_id, learner_id=body.stagiaire_id,
        financeur=body.financeur.model_dump() if body.financeur else None, title=body.titre, quote_id=body.devis_id,
        session_id=body.session_id, enrollment_ids=body.inscription_ids, funding_source_id=body.financement_source_id,
        actor=user.full_name, actor_id=user.id)
    db.commit()
    return _detail(db, invoice, user, date.today())


class UpdateIn(BaseModel):
    titre: str | None = Field(default=None, min_length=1, max_length=250)
    client_nom: str | None = Field(default=None, min_length=1, max_length=200)
    client_adresse: str | None = Field(default=None, max_length=300)
    client_code_postal: str | None = Field(default=None, max_length=10)
    client_ville: str | None = Field(default=None, max_length=120)
    client_siret: str | None = Field(default=None, max_length=20)
    bon_commande: str | None = Field(default=None, max_length=80)
    prestation_du: date | None = None
    prestation_au: date | None = None
    echeance: date | None = None
    note: str | None = Field(default=None, max_length=2000)


FIELDS = {"titre": "title", "client_nom": "client_name", "client_adresse": "client_address",
          "client_code_postal": "client_postal_code", "client_ville": "client_city", "client_siret": "client_siret",
          "bon_commande": "purchase_order", "prestation_du": "service_from", "prestation_au": "service_to",
          "echeance": "due_on", "note": "note"}


@router.patch("/factures/{invoice_id}")
def update_invoice(invoice_id: str, body: UpdateIn, db: DB, user: Writer) -> dict:
    invoice = service.lock(db, invoice_id)
    enforce(InvoicePolicy(db, user).can_edit(invoice))
    service.update(db, invoice, {FIELDS[k]: v for k, v in body.model_dump(exclude_unset=True).items()}, user.id)
    db.commit()
    return _detail(db, invoice, user, date.today())


class LineIn(BaseModel):
    libelle: str = Field(min_length=1, max_length=300)
    detail: str | None = Field(default=None, max_length=2000)
    quantite: Decimal = Field(default=Decimal(1), gt=0, le=100000, max_digits=10, decimal_places=2)
    unite: str = "STAGIAIRE"
    prix_unitaire_centimes: int = Field(ge=0, le=1_000_000_000)
    remise_pct: Decimal = Field(default=Decimal(0), ge=0, le=100, max_digits=5, decimal_places=2)
    tva_taux: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    exoneree: bool = False
    formation_id: str | None = None
    session_id: str | None = None
    inscription_id: str | None = None


@router.put("/factures/{invoice_id}/lignes")
def put_lines(invoice_id: str, body: Annotated[list[LineIn], Body(max_length=200)], db: DB, user: Writer) -> dict:
    invoice = service.lock(db, invoice_id)
    enforce(InvoicePolicy(db, user).can_edit(invoice))
    service.replace_lines(db, invoice, [{
        "label": x.libelle.strip(), "detail": x.detail, "quantity": x.quantite, "unit": x.unite,
        "unit_price_cents": x.prix_unitaire_centimes, "discount_pct": x.remise_pct, "vat_rate": x.tva_taux,
        "exempt": x.exoneree, "program_id": x.formation_id, "session_id": x.session_id,
        "enrollment_id": x.inscription_id,
    } for x in body], user.id)
    db.commit()
    db.refresh(invoice)
    return _detail(db, invoice, user, date.today())


@router.delete("/factures/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: str, db: DB, user: Writer) -> None:
    invoice = service.lock(db, invoice_id)
    enforce(InvoicePolicy(db, user).can_edit(invoice))
    service.delete_draft(db, invoice, user.id)
    db.commit()


# ── Émission, avoirs, encaissements ───────────────────────────────────────────────────────────


@router.post("/factures/{invoice_id}/emettre")
def issue_invoice(invoice_id: str, db: DB, user: Issuer) -> dict:
    today = date.today()
    invoice = service.lock(db, invoice_id)
    enforce(InvoicePolicy(db, user, today).can_issue(invoice))
    service.issue(db, invoice, user.full_name, user.id, today)
    db.commit()
    return _detail(db, invoice, user, today)


class CreditLineIn(BaseModel):
    ligne_id: str
    montant_ht_centimes: int = Field(gt=0, le=1_000_000_000_000)


class CreditIn(BaseModel):
    motif: str = Field(min_length=1, max_length=2000)
    lignes: list[CreditLineIn] | None = Field(default=None, max_length=200)  # vide : avoir total du restant


@router.post("/factures/{invoice_id}/avoirs", status_code=201)
def credit_invoice(invoice_id: str, body: CreditIn, db: DB, user: Issuer) -> dict:
    today = date.today()
    invoice = service.lock(db, invoice_id)
    enforce(InvoicePolicy(db, user, today).can_credit(invoice))
    if not body.motif.strip():
        raise InvalidStateError("Indiquez le motif de l'avoir")
    amounts: dict[str, int] | None = None
    if body.lignes:
        amounts = {}
        for x in body.lignes:
            amounts[x.ligne_id] = amounts.get(x.ligne_id, 0) + x.montant_ht_centimes
    note = service.credit(db, invoice, amounts=amounts, reason=body.motif, actor=user.full_name, actor_id=user.id,
                          today=today)
    db.commit()
    return _detail(db, note, user, today)


class PaymentIn(BaseModel):
    montant_centimes: int = Field(gt=0, le=1_000_000_000_000)
    recu_le: date
    mode: Literal["VIREMENT", "CHEQUE", "CARTE", "PRELEVEMENT", "ESPECES", "AUTRE"]
    reference: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)


@router.post("/factures/{invoice_id}/encaissements", status_code=201)
def add_payment(invoice_id: str, body: PaymentIn, db: DB, user: Cashier) -> dict:
    today = date.today()
    invoice = service.lock(db, invoice_id)
    enforce(InvoicePolicy(db, user, today).can_pay(invoice, body.montant_centimes))
    if body.recu_le > today:
        raise InvalidStateError("La date d'encaissement ne peut pas être dans le futur")
    service.record_payment(db, invoice, amount_cents=body.montant_centimes, received_on=body.recu_le, mode=body.mode,
                           reference=body.reference, note=body.note, actor=user.full_name, actor_id=user.id)
    db.commit()
    return _detail(db, invoice, user, today)


class CancelIn(BaseModel):
    motif: str = Field(min_length=1, max_length=2000)


@router.post("/encaissements/{payment_id}/annulation")
def cancel_payment(payment_id: str, body: CancelIn, db: DB, user: Cashier) -> dict:
    today = date.today()
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFoundError("Encaissement introuvable")
    invoice = service.lock(db, payment.invoice_id)
    enforce(InvoicePolicy(db, user, today).can_cancel_payment(payment))
    if not body.motif.strip():
        raise InvalidStateError("Indiquez le motif de l'annulation")
    service.cancel_payment(db, payment, reason=body.motif, actor=user.full_name, actor_id=user.id)
    db.commit()
    return _detail(db, invoice, user, today)
