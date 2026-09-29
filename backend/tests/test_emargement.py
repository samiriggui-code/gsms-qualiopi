"""Émargement électronique : créneaux, code de salle + lien personnel, constat, contre-validation."""

from datetime import datetime, time
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.attendance import service
from app.core.errors import InvalidStateError
from app.platform.decisions import PolicyDenied
from app.platform.settings import ConfigurationService
from app.qualiopi.engine import refresh_all
from app.qualiopi.evaluation.models import ControlResult
from tests.conftest import TODAY, find_session, make_user

PARIS = ZoneInfo("Europe/Paris")


def _at(day, hour: int, minute: int = 0) -> datetime:  # noqa: ANN001
    return datetime.combine(day, time(hour, minute), PARIS)


def _last_morning(demo: Session, reference: str, actor):  # noqa: ANN001, ANN202
    """Tous les jours sont ouvrés pour le test ; renvoie la dernière matinée, vierge."""
    ConfigurationService(demo).set("attendance.weekdays", [1, 2, 3, 4, 5, 6, 7])
    s = find_session(demo, reference)
    service.plan_slots(demo, s, actor)
    slot = max((sl for sl in s.attendance_slots if sl.period == "MATIN"), key=lambda sl: sl.day)
    assert slot.start_time == time(9, 0) and not slot.signatures
    return s, slot


def _formateur_de(demo: Session, reference: str):  # noqa: ANN202
    """Compte formateur relié à la fiche du formateur de la session (il ne voit que ses sessions)."""
    user, headers = make_user(demo, "formateur", email=f"formateur-{reference.lower()}@test.local")
    find_session(demo, reference).trainer.user_id = user.id
    demo.commit()
    return user, headers


def _code(exc: pytest.ExceptionInfo) -> str:
    return exc.value.code


def test_planifier_les_demi_journees_selon_les_reglages(demo: Session) -> None:
    user, _ = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")
    n = service.plan_slots(demo, s, user)
    days = (s.end_date - s.start_date).days + 1
    weekdays = sum(1 for i in range(days) if (s.start_date.toordinal() + i) % 7 not in (6, 0))  # lun.-ven.
    assert n == 2 * weekdays and service.plan_slots(demo, s, user) == 0, "idempotent"


def test_parcours_complet_signature_constat_contre_validation(demo: Session) -> None:
    trainer, _ = _formateur_de(demo, "SST-2026-02")
    s, slot = _last_morning(demo, "SST-2026-02", trainer)
    during = _at(slot.day, 9, 5)
    first, second, *others = [e for e in s.enrollments if e.status != "ANNULE"]

    code = service.issue_slot_code(demo, slot, trainer, now=during)
    token = service.issue_personal_link(demo, first, trainer)
    sig = service.sign(demo, code, token, now=during)
    assert sig.method == "CODE_CRENEAU" and sig.present

    with pytest.raises(PolicyDenied) as e:
        service.sign(demo, code, token, now=during)
    assert _code(e) == "ALREADY_RECORDED"
    token2 = service.issue_personal_link(demo, second, trainer)
    with pytest.raises(PolicyDenied) as e:
        service.sign(demo, code, token2, now=_at(slot.day, 18, 0))
    assert _code(e) == "OUTSIDE_WINDOW"
    with pytest.raises(PolicyDenied) as e:
        service.sign(demo, "faux-code", token2, now=during)
    assert _code(e) == "INVALID_CODE"

    with pytest.raises(PolicyDenied) as e:
        service.validate_slot(demo, slot, trainer, now=during)
    assert _code(e) == "ATTENDANCE_INCOMPLETE" and len(e.value.details) == 1 + len(others)

    with pytest.raises(InvalidStateError, match="motif"):
        service.record(demo, slot, second.id, False, trainer, now=during)
    service.record(demo, slot, second.id, False, trainer, note="Malade, justificatif attendu", now=during)
    for other in others:
        service.record(demo, slot, other.id, True, trainer, now=during)
    service.validate_slot(demo, slot, trainer, now=during)
    assert slot.trainer_signed_at and slot.code_hash is None

    with pytest.raises(PolicyDenied) as e:
        service.record(demo, slot, second.id, True, trainer, now=during)
    assert _code(e) == "SLOT_VALIDATED"
    with pytest.raises(PolicyDenied) as e:
        service.sign(demo, code, token2, now=during)
    assert _code(e) == "INVALID_CODE", "le code de salle ne sert plus après contre-validation"


def test_absence_constatee_tient_la_feuille_pour_qualiopi(demo: Session) -> None:
    trainer, _ = _formateur_de(demo, "SSIAP1-2026-01")
    s = find_session(demo, "SSIAP1-2026-01")  # trou planté : une demi-journée non signée par Chloé Blanc
    chloe = next(e for e in s.enrollments if e.learner.first_name == "Chloé")
    slot = next(sl for sl in s.attendance_slots for sig in sl.signatures if sig.enrollment_id == chloe.id and not sig.signed_at)
    service.record(demo, slot, chloe.id, False, trainer, note="Absente, convocation au tribunal (justificatif reçu)",
                   now=_at(s.end_date, 17))
    refresh_all(demo, trigger="test", today=TODAY)
    demo.commit()
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I12.attendance",
                                                ControlResult.session_id == s.id))
    assert r.status == "DEMONTRABLE", r.explanation


def test_api_roles_et_route_publique(client, demo: Session) -> None:  # noqa: ANN001
    _, hf = _formateur_de(demo, "SST-2026-02")
    _, hl = make_user(demo, "lecture")
    s = find_session(demo, "SST-2026-02")
    assert client.post(f"/api/v1/sessions/{s.id}/creneaux", headers=hf).status_code == 200
    sheet = client.get(f"/api/v1/sessions/{s.id}/emargement", headers=hl).json()
    assert sheet["demi_journees"] and "capabilities" in sheet["demi_journees"][0]
    slot_id = sheet["demi_journees"][0]["id"]
    enrollment_id = sheet["demi_journees"][0]["presences"][0]["enrollment_id"]
    r = client.put(f"/api/v1/creneaux/{slot_id}/presences/{enrollment_id}", json={"present": True}, headers=hl)
    assert r.status_code == 403
    r = client.post("/api/v1/emargement/signer", json={"code": "x", "jeton": "y"})
    assert r.status_code == 409 and r.json()["error"] == "INVALID_CODE", "route publique, réponse neutre"


def test_desactiver_l_emargement_retire_le_droit(client, demo: Session) -> None:  # noqa: ANN001
    _, hq = make_user(demo, "admin")
    _, hf = _formateur_de(demo, "SST-2026-02")
    s = find_session(demo, "SST-2026-02")
    assert client.put("/api/v1/features/attendance", json={"enabled": False}, headers=hq).status_code == 200
    assert client.post(f"/api/v1/sessions/{s.id}/creneaux", headers=hf).status_code == 403
