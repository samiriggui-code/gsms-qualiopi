"""Politique de l'émargement : qui peut signer, constater, contre-valider, et quand.

Un créneau contre-validé par le formateur est verrouillé : il fait preuve pour la formation,
le financeur et Qualiopi, il ne se modifie plus.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import permissions_of
from app.platform.decisions import ALLOW, Decision, deny
from app.platform.features import is_enabled
from app.platform.settings import ConfigurationService
from app.training import models as t

SLOT_ACTIONS = ("code", "record", "validate")
RECORDABLE_SESSION_STATES = ("EN_COURS", "TERMINEE")


def expected_on(slot: t.AttendanceSlot, e: t.Enrollment) -> bool:
    """Règle unique (émargement, clôture, moteur Qualiopi) : une inscription annulée n'est jamais
    attendue ; après un abandon, seules les demi-journées antérieures au jour du départ le sont,
    plus celles du jour du départ déjà émargées."""
    if e.status == "ANNULE":
        return False
    if e.abandoned_on and slot.day >= e.abandoned_on:
        return slot.day == e.abandoned_on and recorded(signature_of(slot, e.id))
    return True


def expected_enrollments(slot: t.AttendanceSlot) -> list[t.Enrollment]:
    return [e for e in slot.session.enrollments if expected_on(slot, e)]


def recorded(sig: t.AttendanceSignature | None) -> bool:
    """Une présence signée ou une absence constatée : dans les deux cas le créneau est tenu."""
    return sig is not None and (sig.signed_at is not None or sig.present is False)


def signature_of(slot: t.AttendanceSlot, enrollment_id: str) -> t.AttendanceSignature | None:
    return next((s for s in slot.signatures if s.enrollment_id == enrollment_id), None)


def _name(e: t.Enrollment) -> str:
    return f"{e.learner.first_name} {e.learner.last_name}"


class AttendancePolicy:
    def __init__(self, db: Session, user: User | None, now: datetime | None = None):
        self.db = db
        self.user = user
        self.config = ConfigurationService(db)
        self.tz = ZoneInfo(self.config.get("general.timezone"))
        self.now = (now or datetime.now(self.tz)).astimezone(self.tz)

    @property
    def today(self) -> date:
        return self.now.date()

    def window(self, slot: t.AttendanceSlot) -> tuple[datetime, datetime] | None:
        if slot.start_time is None or slot.end_time is None:
            return None
        before = timedelta(minutes=self.config.get("attendance.sign_before_minutes", at=slot.day))
        after = timedelta(minutes=self.config.get("attendance.sign_after_minutes", at=slot.day))
        start = datetime.combine(slot.day, slot.start_time, self.tz) - before
        end = datetime.combine(slot.day, slot.end_time, self.tz) + after
        return start, end

    # ── Personnel (formateur, gestion) ───────────────────────────────────────────

    def decide(self, slot: t.AttendanceSlot, action: str) -> Decision:
        if self.user is not None and "attendance.write" not in permissions_of(self.db, self.user):
            return deny("PERMISSION_MISSING", "Permission « attendance.write » requise")
        s = slot.session
        if slot.trainer_signed_at:
            return deny("SLOT_VALIDATED", "Demi-journée contre-validée : elle ne se modifie plus")
        if s.status not in RECORDABLE_SESSION_STATES:
            return deny("SESSION_NOT_RUNNING", f"Session {s.status.lower()} : l'émargement se tient pendant la session")
        if slot.day > self.today:
            return deny("SLOT_NOT_STARTED", f"Demi-journée du {slot.day:%d/%m/%Y} : pas encore commencée")
        if action == "code" and s.status != "EN_COURS":
            return deny("SESSION_NOT_RUNNING", "Le code de salle ne sert que pendant la session")
        if action == "validate":
            missing = [_name(e) for e in expected_enrollments(slot) if not recorded(signature_of(slot, e.id))]
            if missing:
                return deny("ATTENDANCE_INCOMPLETE",
                            f"{len(missing)} stagiaire(s) sans signature ni absence constatée", missing)
        return ALLOW

    def capabilities(self, slot: t.AttendanceSlot) -> dict[str, dict]:
        return {a: self.decide(slot, a).to_dict() for a in SLOT_ACTIONS}

    # ── Stagiaire (lien personnel + code de salle) ───────────────────────────────

    def can_sign(self, slot: t.AttendanceSlot, enrollment: t.Enrollment) -> Decision:
        if not is_enabled(self.db, "attendance") or not self.config.get("attendance.learner_self_sign", at=slot.day):
            return deny("SELF_SIGN_DISABLED", "Signature par les stagiaires désactivée : le formateur saisit la présence")
        if enrollment.session_id != slot.session_id:
            return deny("WRONG_SESSION", "Ce code de salle correspond à une autre session")
        if slot.session.status != "EN_COURS":
            return deny("SESSION_NOT_RUNNING", "La session n'est pas en cours : prévenez le formateur")
        if slot.trainer_signed_at:
            return deny("SLOT_VALIDATED", "Demi-journée déjà contre-validée par le formateur")
        if enrollment not in expected_enrollments(slot):
            return deny("NOT_EXPECTED", "Vous n'êtes pas attendu sur cette demi-journée")
        if recorded(signature_of(slot, enrollment.id)):
            return deny("ALREADY_RECORDED", "Présence déjà enregistrée pour cette demi-journée")
        win = self.window(slot)
        if win is None or not (win[0] <= self.now <= win[1]):
            when = f" (de {win[0]:%H:%M} à {win[1]:%H:%M} le {slot.day:%d/%m/%Y})" if win else ""
            return deny("OUTSIDE_WINDOW", f"Signature possible seulement pendant la demi-journée{when}")
        return ALLOW
