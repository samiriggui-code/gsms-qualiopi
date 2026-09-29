"""Politique du domaine formation : ce qu'une personne peut faire sur une session, maintenant.

Ordre d'évaluation (le même pour l'API et pour l'affichage) :
1. permission (la fonctionnalité inactive a déjà retiré la permission) ;
2. état de la session ;
3. conditions métier, avec le détail de ce qui manque.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.attendance.policy import expected_enrollments, recorded, signature_of
from app.auth.models import User
from app.auth.security import permissions_of
from app.hr.models import StaffMember
from app.platform.decisions import ALLOW, Decision, deny
from app.platform.features import is_enabled
from app.platform.settings import ConfigurationService
from app.training import models as t
from app.training.lifecycle import ENROLLABLE_STATES, FROZEN_ONCE_STARTED, LOCKED_STATES, STARTED_STATES, TRANSITIONS

ACTIONS = ("edit", "delete", "enroll", *TRANSITIONS)
FINAL_ENROLLMENT = ("TERMINE", "ABANDON", "ANNULE")


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


class TrainingPolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()
        self.config = ConfigurationService(db)

    # ── Point d'entrée ───────────────────────────────────────────────────────────

    def decide(self, session: t.TrainingSession, action: str, changes: dict | None = None) -> Decision:
        if action not in ACTIONS:
            return deny("UNKNOWN_ACTION", f"Action inconnue : {action}")
        permission = TRANSITIONS[action].permission if action in TRANSITIONS else "sessions.write"
        if self.user is not None and permission not in permissions_of(self.db, self.user):
            return deny("PERMISSION_MISSING", f"Permission « {permission} » requise")
        if action in TRANSITIONS:
            return self._transition(session, action)
        return getattr(self, f"_{action}")(session, changes or {})

    def capabilities(self, session: t.TrainingSession) -> dict[str, dict]:
        return {a: self.decide(session, a).to_dict() for a in ACTIONS}

    # ── Actions simples ──────────────────────────────────────────────────────────

    def _edit(self, s: t.TrainingSession, changes: dict) -> Decision:
        if s.status in LOCKED_STATES:
            return deny("SESSION_LOCKED", f"Session {s.status.lower()} : plus aucune modification")
        frozen = [f for f in FROZEN_ONCE_STARTED if f in changes and s.status in STARTED_STATES]
        if frozen:
            return deny("FIELD_LOCKED", "La session a démarré : formation et date de début ne changent plus", frozen)
        return ALLOW

    def _delete(self, s: t.TrainingSession, _: dict) -> Decision:
        if s.status != "PLANIFIEE":
            return deny("SESSION_ALREADY_CONFIRMED", "Seule une session planifiée se supprime ; sinon, annulez-la")
        if s.enrollments:
            return deny("HAS_ENROLLMENTS", f"{len(s.enrollments)} inscription(s) : annulez la session plutôt que de la supprimer")
        return ALLOW

    def _enroll(self, s: t.TrainingSession, _: dict) -> Decision:
        if s.status not in ENROLLABLE_STATES:
            return deny("ENROLLMENT_CLOSED", f"Session {s.status.lower()} : inscriptions fermées")
        active = [e for e in s.enrollments if e.status not in ("ANNULE",)]
        if s.capacity is not None and len(active) >= s.capacity:
            return deny("CAPACITY_REACHED", f"Session complète ({s.capacity} places)")
        return ALLOW

    # ── Transitions ──────────────────────────────────────────────────────────────

    def _transition(self, s: t.TrainingSession, action: str) -> Decision:
        tr = TRANSITIONS[action]
        if s.status not in tr.from_states:
            return deny("INVALID_TRANSITION", f"Impossible depuis l'état {s.status} ({tr.label.lower()})")
        return getattr(self, f"_can_{action}")(s)

    def _can_confirm(self, s: t.TrainingSession) -> Decision:
        missing = [label for ok, label in ((s.trainer_id, "formateur"), (s.location, "lieu")) if not ok]
        if missing:
            return deny("SESSION_INCOMPLETE", f"À renseigner avant confirmation : {', '.join(missing)}", missing)
        return self._trainer_available(s)

    def _trainer_available(self, s: t.TrainingSession) -> Decision:
        """Avec le module RH : le formateur n'est pas absent et son contrat couvre la session."""
        if not is_enabled(self.db, "hr") or not s.trainer_id:
            return ALLOW
        staff = self.db.scalar(select(StaffMember).where(StaffMember.trainer_id == s.trainer_id))
        if staff is None:
            return ALLOW  # formateur sans fiche RH (intervenant extérieur ponctuel)
        absences = [a for a in staff.absences if a.overlaps(s.start_date, s.end_date)]
        if absences:
            return deny("TRAINER_UNAVAILABLE", f"{staff.full_name} est absent pendant la session",
                        [{"du": a.start_date.isoformat(), "au": a.end_date.isoformat(), "nature": a.kind} for a in absences])
        if staff.contracts and not any(c.covers(s.start_date, s.end_date) for c in staff.contracts):
            return deny("TRAINER_NO_CONTRACT", f"Aucun contrat de {staff.full_name} ne couvre les dates de la session")
        return ALLOW

    def _can_start(self, s: t.TrainingSession) -> Decision:
        if self.today < s.start_date:
            return deny("NOT_STARTED_YET", f"La session commence le {_fmt(s.start_date)}")
        return ALLOW

    def _can_finish(self, s: t.TrainingSession) -> Decision:
        if self.today < s.end_date:
            return deny("NOT_ENDED_YET", f"La session se termine le {_fmt(s.end_date)}")
        return ALLOW

    def _can_cancel(self, s: t.TrainingSession) -> Decision:
        signed = sum(1 for slot in s.attendance_slots for sig in slot.signatures if sig.signed_at)
        if signed:
            return deny("ATTENDANCE_RECORDED", f"{signed} émargement(s) déjà signés : la session a eu lieu")
        return ALLOW

    def _can_close(self, s: t.TrainingSession) -> Decision:
        """Clôture : tout ce que les financeurs et Qualiopi demanderont doit être là."""
        details: list[dict] = []
        open_enrollments = [e for e in s.enrollments if e.status not in FINAL_ENROLLMENT]
        for e in open_enrollments:
            details.append({"type": "INSCRIPTION_OUVERTE", "stagiaire": _name(e), "statut": e.status})
        slots = sorted((sl for sl in s.attendance_slots if sl.day <= s.end_date), key=lambda sl: (sl.day, sl.period))
        if not slots:
            details.append({"type": "AUCUN_CRENEAU", "message": "aucune demi-journée d'émargement"})
        for sl in slots:
            for e in expected_enrollments(sl):
                if recorded(signature_of(sl, e.id)):
                    continue
                details.append({"type": "EMARGEMENT_MANQUANT", "creneau": f"{sl.day.isoformat()} {sl.period}", "stagiaire": _name(e)})
            if self.config.get("training.close_requires_trainer_validation", at=s.end_date) and not sl.trainer_signed_at:
                details.append({"type": "VALIDATION_FORMATEUR_MANQUANTE", "creneau": f"{sl.day.isoformat()} {sl.period}"})
        if self.config.get("training.close_requires_certificates", at=s.end_date):
            for e in s.enrollments:
                if e.status == "TERMINE" and e.certificate is None:
                    details.append({"type": "ATTESTATION_MANQUANTE", "stagiaire": _name(e)})
        if details:
            counts: dict[str, int] = {}
            for d in details:
                counts[d["type"]] = counts.get(d["type"], 0) + 1
            summary = ", ".join(f"{n} {k.lower().replace('_', ' ')}" for k, n in counts.items())
            return deny("CLOSE_REQUIREMENTS_MISSING", f"Clôture impossible : {summary}", details)
        return ALLOW


def _name(e: t.Enrollment) -> str:
    return f"{e.learner.first_name} {e.learner.last_name}" if e.learner else e.id
