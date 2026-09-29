"""Conditions nommées des circuits. Pas de langage libre : une condition = une fonction relue.

Chaque fonction renvoie None si la condition est remplie, sinon ce qui manque (en français).
Elles lisent les données existantes (inscription, émargement, convention, attestation) :
le financement ne recopie aucune pièce.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable

from app.attendance.policy import expected_on, recorded, signature_of
from app.funding.models import FundingSource
from app.funding.schemes import rule_at
from app.training import models as t


@dataclass
class Ctx:
    source: FundingSource
    enrollment: t.Enrollment
    today: date
    inputs: dict = field(default_factory=dict)  # valeurs saisies avec l'action (n° de dossier, montant…)

    @property
    def session(self) -> t.TrainingSession:
        return self.enrollment.session

    def value(self, name: str):  # noqa: ANN201
        return self.inputs.get(name) if self.inputs.get(name) not in (None, "") else getattr(self.source, name)


def _external_ref(c: Ctx) -> str | None:
    return None if c.value("external_ref") else "référence du financeur (n° de dossier ou d'accord)"


def _amount_granted(c: Ctx) -> str | None:
    return None if c.value("amount_granted") is not None else "montant accordé"


def _amount_paid(c: Ctx) -> str | None:
    return None if c.value("amount_paid") is not None else "montant réglé"


def _invoice_ref(c: Ctx) -> str | None:
    return None if c.value("invoice_ref") else "numéro de facture"


def _agreement_signed(c: Ctx) -> str | None:
    a = c.enrollment.agreement
    return None if a is not None and a.signed_on else "convention ou contrat signé"


def _session_started(c: Ctx) -> str | None:
    s = c.session
    return None if s.status in ("EN_COURS", "TERMINEE", "CLOTUREE") else f"session démarrée (commence le {s.start_date:%d/%m/%Y})"


def _learner_present_once(c: Ctx) -> str | None:
    present = any(sig.present and sig.signed_at for sig in c.enrollment.signatures)
    return None if present else "au moins une demi-journée émargée par le stagiaire"


def _enrollment_finished(c: Ctx) -> str | None:
    if c.enrollment.status in ("TERMINE", "ABANDON") or c.session.status in ("TERMINEE", "CLOTUREE"):
        return None
    return "formation terminée ou abandon enregistré"


def _attendance_complete(c: Ctx) -> str | None:
    missing = [sl for sl in c.session.attendance_slots
               if sl.day <= c.today and expected_on(sl, c.enrollment) and not recorded(signature_of(sl, c.enrollment.id))]
    return None if not missing else f"{len(missing)} demi-journée(s) sans émargement ni absence constatée"


def _certificate_issued(c: Ctx) -> str | None:
    return None if c.enrollment.certificate is not None else "attestation de fin de formation"


def _retraction_elapsed(c: Ctx) -> str | None:
    a = c.enrollment.agreement
    if a is None or not a.signed_on:
        return "contrat signé"
    days = rule_at("personnel.delai_retractation_jours", a.signed_on)["value"]
    end = a.signed_on + timedelta(days=days)
    return None if c.today > end else f"délai de rétractation de {days} jours (jusqu'au {end:%d/%m/%Y})"


CHECKS: dict[str, Callable[[Ctx], str | None]] = {
    "external_ref": _external_ref, "amount_granted": _amount_granted, "amount_paid": _amount_paid,
    "invoice_ref": _invoice_ref, "agreement_signed": _agreement_signed, "session_started": _session_started,
    "learner_present_once": _learner_present_once, "enrollment_finished": _enrollment_finished,
    "attendance_complete": _attendance_complete, "certificate_issued": _certificate_issued,
    "retraction_elapsed": _retraction_elapsed,
}


def realization_rate(enrollment: t.Enrollment, today: date) -> tuple[int, int]:
    """(demi-journées présentes, demi-journées prévues) : base du prorata CPF."""
    slots = [sl for sl in enrollment.session.attendance_slots if enrollment.status != "ANNULE"]
    present = sum(1 for sl in slots if (sig := signature_of(sl, enrollment.id)) and sig.present and sig.signed_at)
    return present, len(slots)
