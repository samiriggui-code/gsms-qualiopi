"""Opérations du financement. Chaque action passe par FundingPolicy (enforce) et est historisée."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.attendance.policy import expected_on, recorded, signature_of
from app.auth.models import User
from app.core.errors import ConflictError, InvalidStateError, NotFoundError
from app.events.publish import publish
from app.funding.conditions import realization_rate
from app.funding.models import INACTIVE, FundingCase, FundingSource, FundingStep
from app.funding.policy import FundingPolicy, case_status, due_on
from app.funding.schemes import load, scheme, schemes
from app.platform.decisions import deny, enforce
from app.platform.features import is_enabled
from app.training import models as t

VALUE_FIELDS = ("external_ref", "amount_granted", "amount_paid", "invoice_ref")
AMOUNT_FIELDS = ("amount_granted", "amount_paid")
CENT = Decimal("0.01")


def money(v) -> Decimal:  # noqa: ANN001
    """Montant en euros au centime ; refuse les montants négatifs."""
    d = Decimal(str(v)).quantize(CENT)
    if d < 0:
        raise InvalidStateError("Un montant ne peut pas être négatif")
    return d


def get_enrollment(db: Session, enrollment_id: str) -> t.Enrollment:
    e = db.get(t.Enrollment, enrollment_id)
    if e is None:
        raise NotFoundError("Inscription introuvable")
    return e


def get_source(db: Session, source_id: str) -> FundingSource:
    s = db.get(FundingSource, source_id)
    if s is None:
        raise NotFoundError("Source de financement introuvable")
    return s


def _enrollment_of(db: Session, source: FundingSource) -> t.Enrollment:
    return db.get(t.Enrollment, source.case.enrollment_id)


def open_case(db: Session, enrollment: t.Enrollment, cost: Decimal | None, actor: User) -> FundingCase:
    if db.scalar(select(FundingCase).where(FundingCase.enrollment_id == enrollment.id)):
        raise ConflictError("Cette inscription a déjà un dossier de financement")
    cost = cost if cost is not None else enrollment.session.program.price_eur
    if cost is None or cost <= 0:
        raise InvalidStateError("Indiquez le coût de la formation pour ce stagiaire")
    case = FundingCase(enrollment_id=enrollment.id, cost_eur=money(cost))
    db.add(case)
    db.flush()
    return case


def add_source(db: Session, case: FundingCase, code: str, actor: User, *, provider_name: str | None = None,
               amount_requested: Decimal | None = None, signatory: str | None = None,
               invoice_recipient: str | None = None, payer_name: str | None = None) -> FundingSource:
    sch = scheme(code)
    if not is_enabled(db, sch.feature):
        enforce(deny("FEATURE_DISABLED", f"Dispositif {sch.code} désactivé pour l'organisme"))
    if any(s.scheme == code and s.state not in INACTIVE for s in case.sources):
        raise ConflictError(f"Une source {code} est déjà active sur ce dossier")
    provider = provider_name or sch.provider
    if sch.payer == "FINANCEUR" and not provider:
        raise InvalidStateError("Indiquez le financeur (ex. « Opco EP », « Atlas »)")
    enrollment = db.get(t.Enrollment, case.enrollment_id)
    default_payer = {"FINANCEUR": provider,
                     "ENTREPRISE": db.get(t.Company, enrollment.company_id).name if enrollment.company_id else None,
                     "STAGIAIRE": f"{enrollment.learner.first_name} {enrollment.learner.last_name}"}[sch.payer]
    src = FundingSource(scheme=code, scheme_version=load()[0], state=sch.initial, provider_name=provider,
                        signatory=signatory, invoice_recipient=invoice_recipient or payer_name or default_payer,
                        payer_kind=sch.payer, payer_name=payer_name or default_payer,
                        amount_requested=money(amount_requested) if amount_requested is not None else None)
    case.sources.append(src)
    db.flush()
    return src


def apply(db: Session, source: FundingSource, action_name: str, inputs: dict, actor: User,
          today: date | None = None) -> FundingSource:
    today = today or date.today()
    enrollment = _enrollment_of(db, source)
    sch = scheme(source.scheme)
    enforce(FundingPolicy(db, actor, today).decide(source, enrollment, action_name, inputs))
    action = sch.actions[action_name]
    motif = (inputs.get("motif") or "").strip()
    if action.reason and not motif:
        raise InvalidStateError("Indiquez le motif")
    inputs = {k: (money(v) if k in AMOUNT_FIELDS and v not in (None, "") else v) for k, v in inputs.items()}
    if inputs.get("amount_granted") is not None:
        case = source.case
        others = sum((s.amount_granted or Decimal(0) for s in case.sources if s is not source and s.state not in INACTIVE), Decimal(0))
        if others + inputs["amount_granted"] > case.cost_eur:
            enforce(deny("OVERFUNDED", f"Le total accordé dépasserait le coût de la formation ({case.cost_eur} €)"))
    for f in VALUE_FIELDS:
        if inputs.get(f) not in (None, ""):
            setattr(source, f, inputs[f])
    before = source.state
    source.state = action.to
    if motif:
        source.reason = motif
    source.steps.append(FundingStep(action=action_name, from_state=before, to_state=action.to, done_on=today,
                                    portal=action.portal, note=motif or inputs.get("note")))
    publish(db, "funding.source_changed", "funding_source", source.id, session_id=enrollment.session_id,
            actor_id=actor.id, payload={"scheme": source.scheme, "from": before, "to": action.to, "action": action_name})
    return source


# ── Vues ─────────────────────────────────────────────────────────────────────────


def _pieces(source: FundingSource, e: t.Enrollment, today: date) -> list[dict]:
    """Pièces du dossier financeur, lues dans les données existantes (jamais recopiées)."""
    slots = [sl for sl in e.session.attendance_slots if sl.day <= today and expected_on(sl, e)]
    done = sum(1 for sl in slots if recorded(signature_of(sl, e.id)))
    a = e.agreement
    state = {
        "programme": ("OK", f"fiche formation {e.session.program.code}"),
        "convention": ("OK", f"signée le {a.signed_on:%d/%m/%Y}") if a and a.signed_on else ("MANQUANTE", "convention non signée"),
        "contrat": ("OK", f"signé le {a.signed_on:%d/%m/%Y}") if a and a.signed_on else ("MANQUANTE", "contrat non signé"),
        "emargements": ("OK" if slots and done == len(slots) else "INCOMPLETE", f"{done}/{len(slots)} demi-journées tenues"),
        "attestation_fin": ("OK", f"émise le {e.certificate.issued_on:%d/%m/%Y}") if e.certificate else ("MANQUANTE", "non émise"),
        "facture": ("OK", source.invoice_ref) if source.invoice_ref else ("MANQUANTE", "non émise"),
    }
    return [{"piece": p, "etat": state[p][0], "detail": state[p][1]} for p in scheme(source.scheme).pieces]


def source_view(db: Session, source: FundingSource, actor: User | None, today: date | None = None) -> dict:
    today = today or date.today()
    e = _enrollment_of(db, source)
    sch = scheme(source.scheme)
    view = {
        "id": source.id, "dispositif": sch.code, "libelle": sch.label, "etat": source.state,
        "financeur": source.provider_name, "signataire": source.signatory, "destinataire_facture": source.invoice_recipient,
        "payeur": {"type": source.payer_kind, "nom": source.payer_name},
        "montants": {"demande": _s(source.amount_requested), "accorde": _s(source.amount_granted), "regle": _s(source.amount_paid)},
        "references": {"financeur": source.external_ref, "facture": source.invoice_ref}, "motif": source.reason,
        "historique": [{"action": st.action, "de": st.from_state, "vers": st.to_state, "le": st.done_on.isoformat(),
                        "portail": st.portal, "par": st.created_by, "note": st.note} for st in source.steps],
        "pieces": _pieces(source, e, today),
        "capabilities": FundingPolicy(db, actor, today).capabilities(source, e),
    }
    if sch.prorata:
        present, planned = realization_rate(e, today)
        view["realisation"] = {"presentes": present, "prevues": planned}
        if source.amount_granted is not None and planned:
            view["realisation"]["montant_facturable_estime"] = _s(
                (source.amount_granted * Decimal(present) / Decimal(planned)).quantize(Decimal("0.01")))
    return view


def case_view(db: Session, case: FundingCase, actor: User | None, today: date | None = None) -> dict:
    e = db.get(t.Enrollment, case.enrollment_id)
    return {"id": case.id, "inscription_id": e.id, "stagiaire": f"{e.learner.first_name} {e.learner.last_name}",
            "session": e.session.reference, **case_status(case),
            "sources": [source_view(db, s, actor, today) for s in case.sources]}


def deadlines(db: Session, today: date, horizon_days: int) -> list[dict]:
    """Actions de financement à faire avec une échéance (portails, facturation), en retard ou proches."""
    out = []
    for src in db.scalars(select(FundingSource)):
        sch = schemes().get(src.scheme)
        if sch is None or src.state in sch.final or not is_enabled(db, sch.feature):
            continue
        e = _enrollment_of(db, src)
        for name, action in sch.actions.items():
            if src.state not in action.from_ or action.due is None:
                continue
            due = due_on(action, e.session.start_date, e.session.end_date)
            if (due - today).days > horizon_days:
                continue
            out.append({"source_id": src.id, "dispositif": sch.code, "action": name, "libelle": action.label,
                        "portail": action.portal, "echeance": due.isoformat(),
                        "etat": "EN_RETARD" if due < today else "A_ECHEANCE",
                        "stagiaire": f"{e.learner.first_name} {e.learner.last_name}", "session": e.session.reference})
    return sorted(out, key=lambda x: x["echeance"])


def _s(v: Decimal | None) -> str | None:
    return None if v is None else str(v)
