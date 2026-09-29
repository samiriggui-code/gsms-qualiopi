"""Domaine formation : cycle de vie des sessions, politique, capacités, routes."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.events.models import OutboxEvent
from app.platform.settings import ConfigurationService
from app.training import models as t
from app.training.policy import TrainingPolicy
from tests.conftest import TODAY, find_session, make_user


def _caps(client, headers, session_id: str) -> dict:  # noqa: ANN001
    r = client.get(f"/api/v1/sessions/{session_id}/capabilities", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_cloture_refusee_avec_le_detail_de_ce_qui_manque(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SSIAP1-2026-01")  # terminée, émargements non contresignés, Chloé Blanc sans signature
    caps = _caps(client, h, s.id)
    close = caps["close"]
    assert close["allowed"] is False and close["code"] == "CLOSE_REQUIREMENTS_MISSING"
    manquants = [d for d in close["details"] if d["type"] == "EMARGEMENT_MANQUANT"]
    assert [d["stagiaire"] for d in manquants] == ["Chloé Blanc"]
    assert sum(1 for d in close["details"] if d["type"] == "VALIDATION_FORMATEUR_MANQUANTE") == 10
    assert caps["delete"]["code"] == "SESSION_ALREADY_CONFIRMED"
    assert caps["enroll"]["code"] == "ENROLLMENT_CLOSED"
    assert caps["edit"] == {"allowed": True}
    r = client.post(f"/api/v1/sessions/{s.id}/transitions/close", json={}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CLOSE_REQUIREMENTS_MISSING" and r.json()["details"]


def test_cloture_possible_une_fois_les_pieces_completes(demo: Session) -> None:
    s = find_session(demo, "SSIAP1-2026-01")
    for sl in s.attendance_slots:
        sl.trainer_signed_at = utcnow()
        for sig in sl.signatures:
            sig.signed_at = sig.signed_at or utcnow()
    demo.flush()
    assert TrainingPolicy(demo, None).decide(s, "close").allowed


def test_reglage_de_cloture_lu_a_la_date_de_fin_de_session(demo: Session) -> None:
    s = find_session(demo, "SSIAP1-2026-01")
    ConfigurationService(demo).set("training.close_requires_trainer_validation", False, reason="Test",
                                   effective_from=TODAY)
    demo.flush()
    decision = TrainingPolicy(demo, None).decide(s, "close")
    types = {d["type"] for d in decision.details}
    assert "VALIDATION_FORMATEUR_MANQUANTE" in types, "la session s'est terminée avant le changement de réglage"


def test_cycle_de_vie_confirmer_puis_annuler(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")  # planifiée, commence dans 8 jours, formateur et lieu renseignés
    assert _caps(client, h, s.id)["start"]["code"] == "INVALID_TRANSITION"
    r = client.post(f"/api/v1/sessions/{s.id}/transitions/confirm", json={}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "CONFIRMEE"
    start = _caps(client, h, s.id)["start"]
    assert start["code"] == "NOT_STARTED_YET" and (s.start_date.strftime("%d/%m/%Y") in start["message"])
    assert client.post(f"/api/v1/sessions/{s.id}/transitions/cancel", json={}, headers=h).status_code == 422, "motif exigé"
    r = client.post(f"/api/v1/sessions/{s.id}/transitions/cancel", json={"motif": "Client reporté à janvier"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "ANNULEE" and r.json()["cancel_reason"] == "Client reporté à janvier"
    assert _caps(client, h, s.id)["edit"]["code"] == "SESSION_LOCKED"
    ev = demo.scalars(select(OutboxEvent).where(OutboxEvent.name == "session.status_changed")).all()
    assert [e.payload["to"] for e in ev] == ["CONFIRMEE", "ANNULEE"]


def test_session_en_cours_ne_change_plus_de_date_de_debut(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-02")
    r = client.patch(f"/api/v1/sessions/{s.id}", json={"start_date": (s.start_date + timedelta(days=1)).isoformat()}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "FIELD_LOCKED"
    r = client.patch(f"/api/v1/sessions/{s.id}", json={"room": "Salle 2"}, headers=h)
    assert r.status_code == 200 and r.json()["room"] == "Salle 2"


def test_creer_inscrire_puis_supprimer(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    program = demo.scalar(select(t.Program).where(t.Program.code == "SST"))
    learner = demo.scalar(select(t.Learner))
    body = {"reference": "SST-2026-09", "program_id": program.id, "start_date": (TODAY + timedelta(days=40)).isoformat(),
            "end_date": (TODAY + timedelta(days=41)).isoformat(), "capacity": 1}
    r = client.post("/api/v1/sessions", json=body, headers=h)
    assert r.status_code == 201 and r.json()["status"] == "PLANIFIEE"
    sid = r.json()["id"]
    assert client.post("/api/v1/sessions", json=body, headers=h).status_code == 409, "référence unique"
    caps = _caps(client, h, sid)
    assert caps["confirm"]["code"] == "SESSION_INCOMPLETE" and caps["confirm"]["details"] == ["formateur", "lieu"]
    assert client.post(f"/api/v1/sessions/{sid}/inscriptions", json={"learner_id": learner.id}, headers=h).status_code == 201
    other = demo.scalars(select(t.Learner)).all()[1]
    r = client.post(f"/api/v1/sessions/{sid}/inscriptions", json={"learner_id": other.id}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CAPACITY_REACHED"
    r = client.delete(f"/api/v1/sessions/{sid}", headers=h)
    assert r.status_code == 409 and r.json()["error"] == "HAS_ENROLLMENTS"


def test_lecture_voit_les_capacites_mais_n_agit_pas(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "lecture")
    s = find_session(demo, "SST-2026-04")
    caps = _caps(client, h, s.id)
    assert caps["confirm"]["code"] == "PERMISSION_MISSING"
    assert client.post(f"/api/v1/sessions/{s.id}/transitions/confirm", json={}, headers=h).status_code == 403
    detail = client.get(f"/api/v1/sessions/{s.id}", headers=h).json()
    assert detail["session"]["reference"] == "SST-2026-04" and "capabilities" in detail
