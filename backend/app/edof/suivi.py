"""Suivi pédagogique d'une formation, tiré uniquement de ce qui est enregistré.

Présences émargées, évaluations et attestations : ce sont des traces de réalisation. Un temps de
connexion n'en est pas une, et la progression du LMS de GSMS School n'est pas reliée à cette base.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.training import models as t

LIMITS = [
    "Seules les demi-journées émargées comptent comme présence ; un temps de connexion n'est pas une preuve "
    "de réalisation.",
    "La progression des cours en ligne (LMS de GSMS School) n'est pas reliée : elle n'apparaît pas ici.",
]


def summary(db: Session, program_id: str) -> dict:
    sessions = list(db.scalars(select(t.TrainingSession).where(t.TrainingSession.program_id == program_id)
                               .order_by(t.TrainingSession.start_date.desc())))
    rows = []
    for s in sessions:
        active = [e for e in s.enrollments if e.status not in ("ANNULE",)]
        slots = len(s.attendance_slots)
        expected = slots * len(active)
        present = db.scalar(select(func.count()).select_from(t.AttendanceSignature)
                            .join(t.AttendanceSlot, t.AttendanceSlot.id == t.AttendanceSignature.slot_id)
                            .where(t.AttendanceSlot.session_id == s.id, t.AttendanceSignature.present.is_(True))) or 0
        assessed = sum(1 for e in active if e.assessments)
        certified = sum(1 for e in active if e.certificate is not None)
        rows.append({
            "session_id": s.id, "reference": s.reference, "start_date": s.start_date, "end_date": s.end_date,
            "status": s.status, "learners": len(active), "slots": slots,
            "attendance": {"present": present, "expected": expected,
                           "rate": round(present / expected * 100, 1) if expected else None},
            "assessed_learners": assessed, "certificates": certified,
            "abandons": sum(1 for e in active if e.status == "ABANDON"),
        })
    return {"sessions": rows, "limits": LIMITS}
