"""API de l'émargement."""

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.attendance import service
from app.auth.security import DB, AttendanceWriter, SessionsReader
from app.core.errors import NotFoundError
from app.core.journal import set_actor
from app.training import models as t
from app.training.service import get_session

router = APIRouter(prefix="/api/v1", tags=["émargement"])


@router.post("/sessions/{session_id}/creneaux")
def plan(session_id: str, db: DB, user: AttendanceWriter) -> dict:
    """Prépare les demi-journées de la session selon les réglages (jours, horaires)."""
    created = service.plan_slots(db, get_session(db, session_id), user)
    db.commit()
    return {"crees": created}


@router.get("/sessions/{session_id}/emargement")
def attendance_sheet(session_id: str, db: DB, user: SessionsReader) -> dict:
    return service.sheet(db, get_session(db, session_id), user)


@router.post("/creneaux/{slot_id}/code")
def slot_code(slot_id: str, db: DB, user: AttendanceWriter) -> dict:
    """Code de salle à imprimer en QR (le front génère l'image). Renouveler invalide l'ancien."""
    code = service.issue_slot_code(db, service.get_slot(db, slot_id), user)
    db.commit()
    return {"code": code, "qr": f"{service.SIGN_PATH}?code={code}"}


@router.post("/inscriptions/{enrollment_id}/lien-emargement")
def personal_link(enrollment_id: str, db: DB, user: AttendanceWriter) -> dict:
    """Lien personnel du stagiaire, à envoyer avec la convocation. Affiché une seule fois."""
    e = db.get(t.Enrollment, enrollment_id)
    if e is None:
        raise NotFoundError("Inscription introuvable")
    token = service.issue_personal_link(db, e, user)
    db.commit()
    return {"jeton": token, "lien": f"{service.SIGN_PATH}?jeton={token}"}


class PresenceIn(BaseModel):
    present: bool
    note: str | None = None


@router.put("/creneaux/{slot_id}/presences/{enrollment_id}")
def record_presence(slot_id: str, enrollment_id: str, body: PresenceIn, db: DB, user: AttendanceWriter) -> dict:
    sig = service.record(db, service.get_slot(db, slot_id), enrollment_id, body.present, user, note=body.note)
    db.commit()
    return {"present": sig.present, "procede": sig.method}


@router.post("/creneaux/{slot_id}/validation")
def validate(slot_id: str, db: DB, user: AttendanceWriter) -> dict:
    slot = service.validate_slot(db, service.get_slot(db, slot_id), user)
    db.commit()
    return {"contre_validee_le": slot.trainer_signed_at.isoformat(), "par": slot.trainer_signed_by}


class SignIn(BaseModel):
    code: str
    jeton: str


@router.post("/emargement/signer")
def learner_sign(body: SignIn, db: DB) -> dict:
    """Route publique : le stagiaire signe avec le code de la salle et son lien personnel."""
    set_actor(db, "stagiaire (lien personnel)")
    sig = service.sign(db, body.code, body.jeton)
    db.commit()
    return {"signe_le": sig.signed_at.isoformat() if isinstance(sig.signed_at, datetime) else None}
