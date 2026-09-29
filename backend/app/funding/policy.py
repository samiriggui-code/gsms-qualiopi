"""Politique du financement : ce qu'on peut faire sur une source, maintenant, et sinon pourquoi."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import permissions_of
from app.funding.calendar import add_business_days
from app.funding.conditions import CHECKS, Ctx
from app.funding.models import INACTIVE, FundingCase, FundingSource
from app.funding.schemes import Action, scheme
from app.platform.decisions import ALLOW, Decision, deny
from app.platform.features import is_enabled

# Conditions remplies par une saisie au moment de l'action (n°, montant) : elles ne bloquent pas l'affichage.
INPUT_CONDITIONS = {"external_ref", "amount_granted", "amount_paid", "invoice_ref"}


def due_on(action: Action, start: date, end: date) -> date | None:
    d = action.due
    if d is None:
        return None
    if d.before == "session_start":
        return add_business_days(start, -d.business_days)
    return add_business_days(start if d.after == "session_start" else end, d.business_days)


def case_status(case: FundingCase) -> dict:
    """Cofinancement : le statut se calcule, il ne se saisit jamais."""
    active = [s for s in case.sources if s.state not in INACTIVE]
    granted = sum((s.amount_granted or Decimal(0) for s in active), Decimal(0))
    paid = sum((s.amount_paid or Decimal(0) for s in active), Decimal(0))
    if any(s.amount_granted is None for s in active):
        status = "PENDING"
    elif granted == 0:
        status = "UNFUNDED"
    elif granted < case.cost_eur:
        status = "PARTIALLY_FUNDED"
    elif granted == case.cost_eur:
        status = "FUNDED"
    else:
        status = "OVERFUNDED"
    cent = Decimal("0.01")
    return {"statut": status, "cout": str(case.cost_eur), "accorde": str(granted.quantize(cent)), "regle": str(paid.quantize(cent)),
            "reste_a_financer": str(max(case.cost_eur - granted, Decimal(0)).quantize(cent))}


class FundingPolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()

    def _ctx(self, source: FundingSource, enrollment, inputs: dict | None) -> Ctx:  # noqa: ANN001
        return Ctx(source=source, enrollment=enrollment, today=self.today, inputs=inputs or {})

    def decide(self, source: FundingSource, enrollment, action_name: str, inputs: dict | None = None,  # noqa: ANN001
               for_display: bool = False) -> Decision:
        sch = scheme(source.scheme)
        action = sch.actions.get(action_name)
        if action is None:
            return deny("UNKNOWN_ACTION", f"Action inconnue pour {sch.code} : {action_name}")
        if self.user is not None and "funding.write" not in permissions_of(self.db, self.user):
            return deny("PERMISSION_MISSING", "Permission « funding.write » requise")
        if not is_enabled(self.db, sch.feature):
            return deny("FEATURE_DISABLED", f"Dispositif {sch.code} désactivé pour l'organisme")
        if source.state in sch.final:
            return deny("FUNDING_CLOSED", f"Source {source.state.lower()} : plus aucune action")
        if source.state not in action.from_:
            return deny("INVALID_TRANSITION", f"Impossible depuis l'état {source.state}")
        ctx = self._ctx(source, enrollment, inputs)
        checks = [c for c in action.requires if not (for_display and c in INPUT_CONDITIONS)]
        missing = [m for c in checks if (m := CHECKS[c](ctx))]
        if missing:
            return deny("FUNDING_REQUIREMENTS_MISSING", "À réunir : " + " ; ".join(missing), missing)
        return ALLOW

    def capabilities(self, source: FundingSource, enrollment) -> dict[str, dict]:  # noqa: ANN001
        sch = scheme(source.scheme)
        s = enrollment.session
        out = {}
        for name, action in sch.actions.items():
            d = self.decide(source, enrollment, name, for_display=True).to_dict()
            d["libelle"] = action.label
            if action.portal:
                d["portail"] = action.portal
            needs = [c for c in action.requires if c in INPUT_CONDITIONS] + (["motif"] if action.reason else [])
            if needs:
                d["a_saisir"] = needs
            due = due_on(action, s.start_date, s.end_date)
            if due and source.state in action.from_:
                d["echeance"] = due.isoformat()
            out[name] = d
        return out
