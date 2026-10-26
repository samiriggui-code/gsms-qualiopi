"""Facturation : brouillons, vérifications, émission numérotée et figée, avoirs, encaissements.

Ce qui relève de la loi est marqué par sa source (`fondement` de chaque vérification) ; le reste est un choix de
GSMS, présenté comme tel. Sources détaillées : docs/facturation/SOURCES.md.

Numérotation : un numéro par pièce émise, dans une séquence chronologique et continue par série (CGI, annexe II,
art. 242 nonies A, 7°). Choix par défaut de GSMS : une série pour les factures (FA) et une pour les avoirs (AV),
recommencée chaque année civile et préfixée par l'année (BOFiP BOI-TVA-DECLA-30-20-20-10 § 80 : deux factures de
la même année ne portent jamais le même numéro). Le compteur est incrémenté dans la transaction de l'émission
(`next_reference`, UPSERT verrouillant) : une émission qui échoue n'utilise aucun numéro, et deux émissions
simultanées reçoivent deux numéros consécutifs.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.editions.service import EXEMPTION, price_to_confirm
from app.application.service.platform.decisions import PolicyDenied, deny
from app.application.service.platform.settings import ConfigurationService
from app.application.service.qualiopi.common import next_reference
from app.database.db import utcnow
from app.errors.errors import InvalidStateError, NotFoundError
from app.event.publish import publish
from app.types import training as t
from app.types.editions import UNITS, Project
from app.types.funding import FundingSource
from app.types.invoicing import ISSUED, PROFESSIONAL_CLIENTS, Invoice, InvoiceLine, Payment

SERIES = {"FACTURE": "FA", "AVOIR": "AV"}
QUOTE_STATUSES = ("VALIDE", "ENVOYE")  # devis validé (et éventuellement envoyé) : contenu figé et relu
SMALL_INVOICE_CENTS = 15_000  # 150 € HT : en dessous, le n° de TVA n'est pas exigé (service-public.fr, F31808)
LAW_ANNEX = "CGI, annexe II, art. 242 nonies A"
LAW_COMMERCE = "Code de commerce, art. L441-9"
GSMS = "Choix de GSMS"


def cents(value: Decimal | float | int | None) -> int:
    """Euros (Decimal) → centimes entiers, arrondi au plus proche."""
    if value is None:
        return 0
    return int((Decimal(str(value)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def line_amount(quantity: Decimal, unit_price_cents: int, discount_pct: Decimal) -> int:
    return _round(Decimal(quantity) * Decimal(unit_price_cents) * (100 - Decimal(discount_pct)) / 100)


def _rate_key(rate: Decimal | None) -> str | None:
    return None if rate is None else f"{Decimal(rate):.2f}"


def breakdown(lines: list[InvoiceLine]) -> list[dict]:
    """Total HT et TVA par taux (CGI, annexe II, art. 242 nonies A, 11°) ; `taux` vide = exonéré."""
    bases: dict[str | None, int] = defaultdict(int)
    for line in lines:
        bases[_rate_key(line.vat_rate)] += line.amount_ht_cents
    return [{"taux": k, "base": b, "tva": 0 if k is None else _round(Decimal(b) * Decimal(k) / 100)}
            for k, b in sorted(bases.items(), key=lambda kv: (kv[0] is not None, kv[0] or ""))]


def _apply_totals(invoice: Invoice, groups: list[dict]) -> None:
    invoice.vat_breakdown = groups
    invoice.total_ht_cents = sum(g["base"] for g in groups)
    invoice.total_vat_cents = sum(g["tva"] for g in groups)
    invoice.total_ttc_cents = invoice.total_ht_cents + invoice.total_vat_cents


def recompute(invoice: Invoice) -> None:
    """Recalcule les montants d'un brouillon (le serveur seul calcule : le client n'envoie jamais un total)."""
    for line in invoice.lines:
        line.amount_ht_cents = line_amount(line.quantity, line.unit_price_cents, line.discount_pct)
    _apply_totals(invoice, breakdown(invoice.lines))


def default_vat_rate(db: Session, today: date) -> Decimal | None:
    """Taux par défaut d'une ligne selon le régime des documents (`documents.tva_regime`) ; vide = exonéré."""
    config = ConfigurationService(db)
    if config.get("documents.tva_regime", today) == "ASSUJETTI":
        return Decimal(str(config.get("documents.tva_taux", today))).quantize(Decimal("0.01"))
    return None


# ── Soldes ───────────────────────────────────────────────────────────────────────────────────


def credit_notes(db: Session, invoice: Invoice) -> list[Invoice]:
    return list(db.scalars(select(Invoice).where(Invoice.credited_invoice_id == invoice.id,
                                                 Invoice.status != "BROUILLON").order_by(Invoice.issued_at)))


def credited_by_line(db: Session, invoice: Invoice) -> dict[str, int]:
    rows = db.execute(
        select(InvoiceLine.credited_line_id, func.sum(InvoiceLine.amount_ht_cents))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(Invoice.credited_invoice_id == invoice.id, Invoice.status != "BROUILLON")
        .group_by(InvoiceLine.credited_line_id))
    return {line_id: int(total) for line_id, total in rows if line_id}


def balance(db: Session, invoice: Invoice) -> dict:
    """Montants en centimes : avoirs, encaissements valides, reste dû, trop-perçu."""
    credited = sum(a.total_ttc_cents for a in credit_notes(db, invoice)) if invoice.kind == "FACTURE" else 0
    paid = sum(p.amount_cents for p in invoice.payments if p.cancelled_at is None)
    rest = invoice.total_ttc_cents - credited - paid if invoice.status in ISSUED else 0  # brouillon : rien n'est dû
    return {"avoirs": credited, "encaisse": paid, "reste_du": max(rest, 0), "trop_percu": max(-rest, 0)}


def refresh_status(db: Session, invoice: Invoice) -> None:
    if invoice.kind != "FACTURE" or invoice.status not in ISSUED:
        return
    b = balance(db, invoice)
    if b["avoirs"] >= invoice.total_ttc_cents:
        status = "ANNULEE"
    elif b["reste_du"] == 0:
        status = "PAYEE"
    elif b["encaisse"] > 0:
        status = "PAYEE_PARTIELLEMENT"
    else:
        status = "EMISE"
    invoice.status = status


def is_overdue(db: Session, invoice: Invoice, today: date) -> bool:
    return (invoice.kind == "FACTURE" and invoice.status in ("EMISE", "PAYEE_PARTIELLEMENT")
            and invoice.due_on is not None and invoice.due_on < today and balance(db, invoice)["reste_du"] > 0)


# ── Création et contenu des brouillons ──────────────────────────────────────────────────────


def lock(db: Session, invoice_id: str) -> Invoice:
    """Charge la pièce en la verrouillant jusqu'à la fin de la transaction (émission, avoir, encaissement)."""
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    if invoice is None:
        raise NotFoundError("Facture introuvable")
    return invoice


def _company_client(company: t.Company) -> dict:
    return {"client_kind": "ENTREPRISE", "company_id": company.id, "client_name": company.name,
            "client_address": company.address, "client_postal_code": company.postal_code,
            "client_city": company.city, "client_siret": company.siret}


def _learner_client(learner: t.Learner) -> dict:
    return {"client_kind": "STAGIAIRE", "learner_id": learner.id, "client_name": learner.full_name}


def _enrollment_line(e: t.Enrollment, vat: Decimal | None) -> InvoiceLine:
    s, p = e.session, e.session.program
    return InvoiceLine(
        label=f"{p.title} — session {s.reference}",
        detail=f"Stagiaire : {e.learner.full_name}. Du {s.start_date:%d/%m/%Y} au {s.end_date:%d/%m/%Y}.",
        quantity=Decimal(1), unit="STAGIAIRE", unit_price_cents=cents(p.price_eur), discount_pct=Decimal(0),
        vat_rate=vat, program_id=p.id, session_id=s.id, enrollment_id=e.id)


def create(db: Session, *, client_kind: str, company_id: str | None = None, learner_id: str | None = None,
           financeur: dict | None = None, title: str | None = None, quote_id: str | None = None,
           session_id: str | None = None, enrollment_ids: list[str] | None = None,
           funding_source_id: str | None = None, actor: str, actor_id: str | None,
           today: date | None = None) -> Invoice:
    """Brouillon de facture, sans numéro. Les lignes viennent d'un devis validé, d'inscriptions d'une session ou
    d'une source de financement ; sinon elles sont saisies ensuite."""
    today = today or date.today()
    vat = default_vat_rate(db, today)
    client: dict = {}
    lines: list[InvoiceLine] = []
    source = None
    if funding_source_id:
        source = db.get(FundingSource, funding_source_id)
        if source is None:
            raise NotFoundError("Source de financement introuvable")
    if client_kind == "ENTREPRISE":
        company = db.get(t.Company, company_id) if company_id else None
        if company is None:
            raise NotFoundError("Entreprise introuvable")
        client = _company_client(company)
    elif client_kind == "STAGIAIRE":
        learner = db.get(t.Learner, learner_id) if learner_id else None
        if learner is None:
            raise NotFoundError("Stagiaire introuvable")
        client = _learner_client(learner)
    elif client_kind == "FINANCEUR":
        data = financeur or {}
        name = (data.get("nom") or "").strip() or (
            (source.invoice_recipient or source.provider_name or "").strip() if source else "")
        if not name:
            raise PolicyDenied(deny("CLIENT_MISSING", "Indiquez le financeur à facturer (nom, adresse)",
                                    [{"cible": "client"}]))
        client = {"client_kind": "FINANCEUR", "client_name": name, "client_address": data.get("adresse"),
                  "client_postal_code": data.get("code_postal"), "client_city": data.get("ville"),
                  "client_siret": data.get("siret")}
    else:
        raise InvalidStateError(f"Type de client inconnu : {client_kind}")

    quote = None
    if quote_id:
        quote = db.get(Project, quote_id)
        if quote is None or quote.kind != "DEVIS":
            raise NotFoundError("Devis introuvable")
        if quote.status not in QUOTE_STATUSES:
            raise PolicyDenied(deny("QUOTE_NOT_VALIDATED", "Seul un devis validé peut être facturé",
                                    [{"cible": "devis", "id": quote.id, "statut": quote.status}]))
        if client_kind != "ENTREPRISE" or quote.company_id != client.get("company_id"):
            raise PolicyDenied(deny("QUOTE_OTHER_CLIENT", "Ce devis est adressé à un autre client",
                                    [{"cible": "devis", "id": quote.id}]))
        lines += [InvoiceLine(label=x.label, detail=x.detail, quantity=x.quantity, unit=x.unit,
                              unit_price_cents=cents(x.unit_price), discount_pct=x.discount_pct, vat_rate=vat,
                              program_id=x.program_id) for x in quote.lines]

    enrollments: list[t.Enrollment] = []
    if session_id or enrollment_ids:
        session = db.get(t.TrainingSession, session_id) if session_id else None
        if session is None:
            raise NotFoundError("Session introuvable")
        wanted = set(enrollment_ids or [])
        enrollments = [e for e in db.scalars(select(t.Enrollment).where(t.Enrollment.session_id == session.id))
                       if e.status != "ANNULE" and (not wanted or e.id in wanted)]
        unknown = wanted - {e.id for e in enrollments}
        if unknown:
            raise PolicyDenied(deny("ENROLLMENT_NOT_IN_SESSION", "Inscription absente de cette session ou annulée",
                                    [{"cible": "inscription", "id": i} for i in sorted(unknown)]))
    if source is not None and not enrollments:
        enrollments = [db.get(t.Enrollment, source.case.enrollment_id)]
    lines += [_enrollment_line(e, vat) for e in enrollments if e is not None]

    sessions = [e.session for e in enrollments if e is not None]
    invoice = Invoice(
        kind="FACTURE", status="BROUILLON", **client, funding_source_id=source.id if source else None,
        quote_id=quote.id if quote else None,
        title=(title or "").strip() or (quote.title if quote else f"Facture {client['client_name']}")[:250],
        service_from=min((s.start_date for s in sessions), default=None),
        service_to=max((s.end_date for s in sessions), default=None), author_id=actor_id, created_by=actor)
    for i, line in enumerate(lines):
        line.position = i
        invoice.lines.append(line)
    recompute(invoice)
    db.add(invoice)
    db.flush()
    publish(db, "invoice.created", "invoice", invoice.id, actor_id=actor_id,
            payload={"client_kind": client_kind, "lignes": len(lines)})
    return invoice


DRAFT_FIELDS = ("title", "client_name", "client_address", "client_postal_code", "client_city", "client_siret",
                "purchase_order", "service_from", "service_to", "due_on", "note")


def update(db: Session, invoice: Invoice, data: dict, actor_id: str | None) -> Invoice:
    for key, value in data.items():
        if key in DRAFT_FIELDS:
            setattr(invoice, key, value.strip() if isinstance(value, str) else value)
    db.flush()
    publish(db, "invoice.updated", "invoice", invoice.id, actor_id=actor_id, payload={"fields": sorted(data)})
    return invoice


def replace_lines(db: Session, invoice: Invoice, lines: list[dict], actor_id: str | None,
                  today: date | None = None) -> Invoice:
    """Remplace toutes les lignes ; les rattachements (formation, session, inscription) sont vérifiés."""
    today = today or date.today()
    default = default_vat_rate(db, today)
    for line in lines:
        if line.get("unit", "STAGIAIRE") not in UNITS:
            raise InvalidStateError(f"Unité inconnue : {line['unit']}")
        for key, model, label in (("program_id", t.Program, "Formation"), ("session_id", t.TrainingSession, "Session"),
                                  ("enrollment_id", t.Enrollment, "Inscription")):
            if line.get(key) and db.get(model, line[key]) is None:
                raise NotFoundError(f"{label} introuvable")
    invoice.lines.clear()
    db.flush()
    for i, line in enumerate(lines):
        exempt = line.pop("exempt", False)
        rate = line.pop("vat_rate", None)
        invoice.lines.append(InvoiceLine(position=i, vat_rate=None if exempt else (rate if rate is not None else default),
                                         **line))
    recompute(invoice)
    db.flush()
    publish(db, "invoice.updated", "invoice", invoice.id, actor_id=actor_id, payload={"fields": ["lignes"]})
    return invoice


def delete_draft(db: Session, invoice: Invoice, actor_id: str | None) -> None:
    """Un brouillon n'a pas de numéro : le supprimer ne crée aucun trou dans la numérotation."""
    publish(db, "invoice.deleted", "invoice", invoice.id, actor_id=actor_id, payload={"title": invoice.title})
    db.delete(invoice)
    db.flush()


# ── Vérifications avant émission ─────────────────────────────────────────────────────────────


def checks(db: Session, invoice: Invoice, today: date | None = None) -> list[dict]:
    """Ce qui empêche d'émettre (`bloquant`) ou mérite d'être relu, avec où corriger et sur quel fondement."""
    today = today or date.today()
    config = ConfigurationService(db)
    org = db.scalar(select(t.Organization))
    out: list[dict] = []
    professional = invoice.client_kind in PROFESSIONAL_CLIENTS

    def add(code: str, message: str, cible: str, fondement: str, *, cible_id: str | None = None,
            bloquant: bool = True) -> None:
        out.append({"code": code, "message": message, "cible": cible, "id": cible_id, "fondement": fondement,
                    "bloquant": bloquant})

    if org is None or not org.siret:
        add("ORG_SIRET", "SIRET de l'organisme manquant", "organisme", f"{LAW_ANNEX}, 1°")
    if not config.get("documents.adresse", today):
        add("ORG_ADDRESS", "Adresse de l'organisme manquante", "parametres", f"{LAW_ANNEX}, 1°")
    if config.get("documents.tva_regime", today) == "NON_RENSEIGNE":
        add("VAT_REGIME", "Régime de TVA de l'organisme non renseigné", "parametres", f"{LAW_ANNEX}, 8° et 12°")
    if not config.get("facturation.forme_juridique", today):
        add("LEGAL_FORM", "Forme juridique et capital non renseignés (à indiquer si l'organisme est une société)",
            "parametres", "service-public.fr, fiche F31808", bloquant=False)
    if not (invoice.client_name or "").strip():
        add("CLIENT_NAME", "Nom du client manquant", "client", f"{LAW_ANNEX}, 1°")
    if not (invoice.client_address and invoice.client_postal_code and invoice.client_city):
        add("CLIENT_ADDRESS", f"Adresse de {invoice.client_name or 'du client'} incomplète", "client",
            f"{LAW_ANNEX}, 1° ; {LAW_COMMERCE}")
    if professional and not invoice.client_siret:
        add("CLIENT_SIREN", "SIREN du client non renseigné : mention exigée sur les factures électroniques "
                            "(calendrier de la réforme)", "client", f"{LAW_ANNEX}, 1°", bloquant=False)
    if not invoice.lines:
        add("NO_LINES", "Aucune ligne à facturer", "lignes", f"{LAW_ANNEX}, 8°")
    elif invoice.total_ttc_cents <= 0:
        add("TOTAL_ZERO", "Le total de la facture est nul", "lignes", GSMS)
    programs = {p.id: p for p in db.scalars(select(t.Program).where(
        t.Program.id.in_([x.program_id for x in invoice.lines if x.program_id])))} if invoice.lines else {}
    for line in invoice.lines:
        program = programs.get(line.program_id or "")
        if line.unit_price_cents == 0:
            add("LINE_PRICE", f"Prix nul : {line.label}", "lignes", GSMS, cible_id=line.id, bloquant=False)
        elif (program is not None and price_to_confirm(program) and program.price_eur is not None
              and line.unit_price_cents == cents(program.price_eur)):
            add("PRICE_TO_CONFIRM", f"Tarif de {program.code} encore « à confirmer » dans la fiche formation",
                "formation", GSMS, cible_id=program.id)
    taxable = any(x.vat_rate is not None for x in invoice.lines)
    if taxable and invoice.total_ht_cents > SMALL_INVOICE_CENTS and not config.get("facturation.numero_tva", today):
        add("VAT_NUMBER", "Numéro de TVA intracommunautaire de l'organisme manquant (lignes soumises à la TVA)",
            "parametres", f"{LAW_ANNEX}, 2°")
    if invoice.service_to is None:
        add("SERVICE_DATE", "Date de réalisation de la prestation manquante", "facture", f"{LAW_ANNEX}, 10°")
    elif invoice.service_from and invoice.service_from > invoice.service_to:
        add("SERVICE_DATES", "Période de prestation incohérente (début après la fin)", "facture", GSMS)
    if invoice.kind == "FACTURE" and invoice.due_on is not None and invoice.due_on < today:
        add("DUE_DATE", "Date d'échéance déjà passée", "facture", LAW_COMMERCE)
    if invoice.kind == "FACTURE" and professional:
        if not config.get("facturation.taux_penalites", today):
            add("PENALTY_RATE", "Taux des pénalités de retard non renseigné", "parametres", LAW_COMMERCE)
        if not config.get("facturation.escompte", today):
            add("DISCOUNT_TERMS", "Conditions d'escompte non renseignées", "parametres", LAW_COMMERCE)
    enrollment_ids = [x.enrollment_id for x in invoice.lines if x.enrollment_id]
    if invoice.kind == "FACTURE" and enrollment_ids:
        taken = db.execute(
            select(InvoiceLine.enrollment_id, Invoice.number).join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(InvoiceLine.enrollment_id.in_(enrollment_ids), Invoice.kind == "FACTURE",
                   Invoice.id != invoice.id, Invoice.status.in_(("EMISE", "PAYEE_PARTIELLEMENT", "PAYEE")))).all()
        for enrollment_id, number in taken:
            add("ALREADY_INVOICED", f"Inscription déjà facturée sur {number}", "lignes", GSMS,
                cible_id=enrollment_id, bloquant=False)
    return out


def blocking(issues: list[dict]) -> list[dict]:
    return [x for x in issues if x["bloquant"]]


# ── Émission, avoirs, encaissements ─────────────────────────────────────────────────────────


def issue(db: Session, invoice: Invoice, actor: str, actor_id: str | None, today: date | None = None, *,
          series: str | None = None) -> Invoice:
    """Numérote, fige (HTML + empreinte) et émet. La politique a déjà jugé ; l'appelant valide la transaction."""
    from app.application.service.invoicing import rendu

    today = today or date.today()
    if invoice.status != "BROUILLON":
        raise InvalidStateError("Pièce déjà émise")
    if invoice.kind == "FACTURE":
        recompute(invoice)
        if invoice.due_on is None:
            invoice.due_on = today + timedelta(days=ConfigurationService(db).get("facturation.delai_paiement_jours", today))
    invoice.issued_on = today
    invoice.fiscal_year = today.year
    invoice.issued_at = utcnow()
    invoice.issued_by = actor
    invoice.number = next_reference(db, f"{series or SERIES[invoice.kind]}-{today.year}", 4)
    db.flush()
    doc = rendu.archive(db, invoice, actor, actor_id, today)
    # Le statut change en dernier, avec le document : une pièce émise n'est plus jamais modifiée.
    invoice.document_id = doc.id
    invoice.status = "EMISE"
    db.flush()
    source = db.get(FundingSource, invoice.funding_source_id) if invoice.funding_source_id else None
    if source is not None and invoice.kind == "FACTURE" and not source.invoice_ref:
        source.invoice_ref = invoice.number
    name = "invoice.issued" if invoice.kind == "FACTURE" else "credit_note.issued"
    publish(db, name, "invoice", invoice.id, actor_id=actor_id,
            payload={"numero": invoice.number, "total_ttc_centimes": invoice.total_ttc_cents,
                     "facture_id": invoice.credited_invoice_id})
    return invoice


def credit(db: Session, invoice: Invoice, *, amounts: dict[str, int] | None, reason: str, actor: str,
           actor_id: str | None, today: date | None = None, series: str | None = None) -> Invoice:
    """Émet un avoir sur `invoice`. `amounts` : {id de ligne: montant HT en centimes} ; vide = tout le restant.

    Plafond par ligne : montant HT de la ligne moins les avoirs déjà émis sur elle. Quand un taux de TVA est
    entièrement crédité, la TVA de l'avoir solde exactement celle de la facture (pas d'écart d'arrondi)."""
    today = today or date.today()
    done = credited_by_line(db, invoice)
    remaining = {x.id: x.amount_ht_cents - done.get(x.id, 0) for x in invoice.lines}
    by_id = {x.id: x for x in invoice.lines}
    wanted = {k: v for k, v in remaining.items() if v > 0} if not amounts else amounts
    refused = []
    for line_id, amount in wanted.items():
        if line_id not in by_id:
            refused.append({"ligne": line_id, "motif": "ligne absente de cette facture"})
        elif amount <= 0 or amount > remaining[line_id]:
            refused.append({"ligne": line_id, "libelle": by_id[line_id].label, "demande": amount,
                            "restant": remaining[line_id]})
    if refused or not wanted:
        raise PolicyDenied(deny("CREDIT_EXCEEDS_REMAINING",
                                "Montant d'avoir supérieur au restant de la ligne" if refused else "Rien à créditer",
                                refused))
    note = Invoice(
        kind="AVOIR", status="BROUILLON", title=f"Avoir sur la facture {invoice.number}", reason=reason.strip(),
        credited_invoice_id=invoice.id, client_kind=invoice.client_kind, company_id=invoice.company_id,
        learner_id=invoice.learner_id, funding_source_id=invoice.funding_source_id, quote_id=invoice.quote_id,
        client_name=invoice.client_name, client_address=invoice.client_address,
        client_postal_code=invoice.client_postal_code, client_city=invoice.client_city,
        client_siret=invoice.client_siret, purchase_order=invoice.purchase_order,
        service_from=invoice.service_from, service_to=invoice.service_to, author_id=actor_id, created_by=actor)
    for i, (line_id, amount) in enumerate(wanted.items()):
        src = by_id[line_id]
        note.lines.append(InvoiceLine(
            position=i, label=src.label, detail=src.detail, quantity=Decimal(1), unit="FORFAIT",
            unit_price_cents=amount, discount_pct=Decimal(0), vat_rate=src.vat_rate, amount_ht_cents=amount,
            program_id=src.program_id, session_id=src.session_id, enrollment_id=src.enrollment_id,
            credited_line_id=src.id))
    groups = breakdown(note.lines)
    previous = defaultdict(lambda: [0, 0])
    for other in credit_notes(db, invoice):
        for g in other.vat_breakdown or []:
            previous[g["taux"]][0] += g["base"]
            previous[g["taux"]][1] += g["tva"]
    original = {g["taux"]: g for g in invoice.vat_breakdown or []}
    for g in groups:
        base = original.get(g["taux"])
        if base is not None and previous[g["taux"]][0] + g["base"] == base["base"]:
            g["tva"] = base["tva"] - previous[g["taux"]][1]
    _apply_totals(note, groups)
    db.add(note)
    db.flush()
    issue(db, note, actor, actor_id, today, series=series)
    db.flush()
    db.refresh(invoice)
    refresh_status(db, invoice)
    return note


def record_payment(db: Session, invoice: Invoice, *, amount_cents: int, received_on: date, mode: str,
                   reference: str | None, note: str | None, actor: str, actor_id: str | None) -> Payment:
    payment = Payment(invoice_id=invoice.id, amount_cents=amount_cents, received_on=received_on, mode=mode,
                      reference=(reference or "").strip() or None, note=(note or "").strip() or None, created_by=actor)
    invoice.payments.append(payment)
    db.flush()
    refresh_status(db, invoice)
    publish(db, "payment.recorded", "invoice", invoice.id, actor_id=actor_id,
            payload={"encaissement_id": payment.id, "montant_centimes": amount_cents, "statut": invoice.status})
    return payment


def cancel_payment(db: Session, payment: Payment, *, reason: str, actor: str, actor_id: str | None) -> Payment:
    payment.cancelled_at = utcnow()
    payment.cancelled_by = actor
    payment.cancel_reason = reason.strip()
    db.flush()
    refresh_status(db, payment.invoice)
    publish(db, "payment.cancelled", "invoice", payment.invoice_id, actor_id=actor_id,
            payload={"encaissement_id": payment.id, "statut": payment.invoice.status})
    return payment


def mention_vat(invoice: Invoice) -> str | None:
    """Mention d'exonération (CGI, annexe II, art. 242 nonies A, 12°) si une ligne est exonérée."""
    return EXEMPTION if any(x.vat_rate is None for x in invoice.lines) else None
