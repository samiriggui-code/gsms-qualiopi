"""Émargement : préparer les créneaux, signer, constater, contre-valider.

Deux facteurs pour qu'un stagiaire signe lui-même :
- le **code de salle** du créneau (QR imprimé et affiché, renouvelable) prouve qu'il est là ;
- son **lien personnel** (envoyé avec la convocation) prouve qui il est.
Seules les empreintes SHA-256 de ces secrets sont conservées.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.attendance.policy import AttendancePolicy, expected_enrollments, recorded, signature_of
from app.auth.models import User
from app.core.db import utcnow
from app.core.errors import InvalidStateError, NotFoundError
from app.events.publish import publish
from app.platform.decisions import deny, enforce
from app.platform.settings import ConfigurationService
from app.training import models as t
from app.training.lifecycle import LOCKED_STATES

SIGN_PATH = "/emarger"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def get_slot(db: Session, slot_id: str) -> t.AttendanceSlot:
    slot = db.get(t.AttendanceSlot, slot_id)
    if slot is None:
        raise NotFoundError("Demi-journée introuvable")
    return slot


# ── Préparation ──────────────────────────────────────────────────────────────────


def plan_slots(db: Session, s: t.TrainingSession, actor: User) -> int:
    """Crée les demi-journées de la session selon les réglages (jours ouvrés, horaires). Idempotent."""
    if s.status in LOCKED_STATES:
        enforce(deny("SESSION_LOCKED", f"Session {s.status.lower()} : plus aucune modification"))
    config = ConfigurationService(db)
    existing = {(sl.day, sl.period): sl for sl in s.attendance_slots}
    created = 0
    day = s.start_date
    while day <= s.end_date:
        if day.isoweekday() in config.get("attendance.weekdays", at=day):
            for d in config.get("attendance.slots", at=day):
                old = existing.get((day, d.period))
                if old is not None and old.start_time is None and not old.trainer_signed_at:
                    old.start_time, old.end_time = d.start, d.end  # créneau antérieur sans horaires
                elif old is None:
                    db.add(t.AttendanceSlot(session_id=s.id, day=day, period=d.period, start_time=d.start, end_time=d.end))
                    created += 1
        day += timedelta(days=1)
    db.flush()
    db.refresh(s)
    return created


def issue_slot_code(db: Session, slot: t.AttendanceSlot, actor: User, now: datetime | None = None) -> str:
    """Nouveau code de salle (l'ancien cesse de fonctionner). À imprimer en QR et afficher."""
    enforce(AttendancePolicy(db, actor, now).decide(slot, "code"))
    code = secrets.token_urlsafe(9)
    slot.code_hash = _hash(code)
    return code


def issue_personal_link(db: Session, enrollment: t.Enrollment, actor: User) -> str:
    """Lien personnel d'émargement du stagiaire (l'ancien cesse de fonctionner)."""
    if enrollment.status == "ANNULE":
        raise InvalidStateError("Inscription annulée")
    token = secrets.token_urlsafe(24)
    enrollment.sign_token_hash = _hash(token)
    return token


# ── Signature par le stagiaire ───────────────────────────────────────────────────


def sign(db: Session, code: str, token: str, now: datetime | None = None) -> t.AttendanceSignature:
    slot = db.scalar(select(t.AttendanceSlot).where(t.AttendanceSlot.code_hash == _hash(code or "")))
    enrollment = db.scalar(select(t.Enrollment).where(t.Enrollment.sign_token_hash == _hash(token or "")))
    if slot is None or enrollment is None:
        # Même réponse dans les deux cas : on ne dit pas lequel des deux secrets est faux.
        enforce(deny("INVALID_CODE", "Code de salle ou lien personnel invalide"))
    policy = AttendancePolicy(db, None, now)
    enforce(policy.can_sign(slot, enrollment))
    sig = signature_of(slot, enrollment.id)
    if sig is None:
        sig = t.AttendanceSignature(enrollment_id=enrollment.id)
        slot.signatures.append(sig)  # garde la liste du créneau à jour pour les contrôles suivants
    sig.present = True
    sig.signed_at = utcnow()
    sig.method = "CODE_CRENEAU"
    sig.recorded_by = f"{enrollment.learner.first_name} {enrollment.learner.last_name} (lien personnel)"
    db.flush()
    publish(db, "attendance.signed", "attendance_signature", sig.id, session_id=slot.session_id,
            program_id=slot.session.program_id, payload={"slot_id": slot.id, "enrollment_id": enrollment.id})
    return sig


# ── Constat et contre-validation par le formateur ────────────────────────────────


def record(db: Session, slot: t.AttendanceSlot, enrollment_id: str, present: bool, actor: User,
           note: str | None = None, now: datetime | None = None) -> t.AttendanceSignature:
    """Le formateur constate une présence ou une absence (motif obligatoire pour une absence)."""
    enforce(AttendancePolicy(db, actor, now).decide(slot, "record"))
    enrollment = next((e for e in expected_enrollments(slot) if e.id == enrollment_id), None)
    if enrollment is None:
        raise NotFoundError("Stagiaire non attendu sur cette demi-journée")
    if not present and not (note or "").strip():
        raise InvalidStateError("Indiquez le motif ou la nature de l'absence")
    sig = signature_of(slot, enrollment_id)
    if sig is None:
        sig = t.AttendanceSignature(enrollment_id=enrollment_id)
        slot.signatures.append(sig)
    sig.present = present
    sig.signed_at = utcnow() if present else None
    sig.method = "FORMATEUR"
    sig.recorded_by = f"{actor.full_name} <{actor.email}>"
    sig.note = note
    db.flush()
    publish(db, "attendance.signed", "attendance_signature", sig.id, session_id=slot.session_id,
            program_id=slot.session.program_id, actor_id=actor.id, payload={"slot_id": slot.id, "enrollment_id": enrollment_id})
    return sig


def validate_slot(db: Session, slot: t.AttendanceSlot, actor: User, now: datetime | None = None) -> t.AttendanceSlot:
    """Contre-validation : toutes les présences ou absences sont renseignées ; le créneau est verrouillé."""
    enforce(AttendancePolicy(db, actor, now).decide(slot, "validate"))
    slot.trainer_signed_at = utcnow()
    slot.trainer_signed_by = f"{actor.full_name} <{actor.email}>"
    slot.code_hash = None  # le code de salle ne sert plus
    publish(db, "attendance.slot_validated", "attendance_slot", slot.id, session_id=slot.session_id,
            program_id=slot.session.program_id, actor_id=actor.id)
    return slot


# ── Vue ──────────────────────────────────────────────────────────────────────────


def sheet(db: Session, s: t.TrainingSession, actor: User, now: datetime | None = None) -> dict:
    """Feuille d'émargement : demi-journées × stagiaires, avec les capacités de chaque demi-journée."""
    policy = AttendancePolicy(db, actor, now)
    slots = sorted(s.attendance_slots, key=lambda sl: (sl.day, sl.period != "MATIN"))
    rows = []
    for sl in slots:
        expected = expected_enrollments(sl)
        cells = []
        for e in s.enrollments:
            sig = signature_of(sl, e.id)
            if e not in expected:
                state = "NON_ATTENDU"
            elif not recorded(sig):
                state = "MANQUANT"
            else:
                state = "PRESENT" if sig.present else "ABSENT"
            cells.append({"enrollment_id": e.id, "stagiaire": f"{e.learner.first_name} {e.learner.last_name}", "etat": state,
                          "heure": sig.signed_at.isoformat() if sig and sig.signed_at else None,
                          "procede": sig.method if sig else None, "note": sig.note if sig else None})
        win = policy.window(sl)
        rows.append({
            "id": sl.id, "jour": sl.day.isoformat(), "periode": sl.period,
            "horaires": f"{sl.start_time:%H:%M}-{sl.end_time:%H:%M}" if sl.start_time and sl.end_time else None,
            "fenetre_signature": [win[0].isoformat(), win[1].isoformat()] if win else None,
            "contre_validee": {"le": sl.trainer_signed_at.isoformat(), "par": sl.trainer_signed_by} if sl.trainer_signed_at else None,
            "code_actif": sl.code_hash is not None,
            "presences": cells,
            "capabilities": policy.capabilities(sl),
        })
    return {"session": s.reference, "demi_journees": rows, "sign_path": SIGN_PATH}
