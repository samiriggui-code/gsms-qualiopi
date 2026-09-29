"""Échéancier : le moteur prévient avant l'échéance, au lieu de constater après."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.demo import PLANTED_MILESTONES
from app.events.publish import publish
from app.qualiopi.engine import process_pending, refresh_all
from app.qualiopi.evidence.models import Evidence
from app.qualiopi.schedule.models import MilestoneStatus
from app.qualiopi.schedule.service import MilestoneDef, assess, load_circuit
from app.training import models as t
from tests.conftest import TODAY, find_session, make_user


def _status(db: Session, ref: str, key: str) -> MilestoneStatus:
    s = find_session(db, ref)
    return db.scalar(select(MilestoneStatus).where(MilestoneStatus.session_id == s.id, MilestoneStatus.key == key))


def test_le_moteur_trouve_exactement_les_jalons_plantes(demo: Session) -> None:
    refs = {s.id: s.reference for s in demo.scalars(select(t.TrainingSession))}
    found = {
        (refs[m.session_id], m.key, m.status)
        for m in demo.scalars(select(MilestoneStatus))
        if m.status in ("EN_RETARD", "A_ECHEANCE")
    }
    assert found == {(g.session, g.key, g.status) for g in PLANTED_MILESTONES}


def test_explication_nominative_et_date(demo: Session) -> None:
    m = _status(demo, "SST-2026-04", "J-10.convocation")
    assert (m.done, m.total) == (0, 4)
    assert m.due_on == TODAY + timedelta(days=-2)
    assert "dépassée de 2 jour(s)" in m.explanation and "Zoé Robin" in m.explanation
    assert m.owner == "gestion" and m.indicators == [9]


def test_le_temps_qui_passe_fait_basculer_en_retard(demo: Session) -> None:
    assert _status(demo, "SST-2026-04", "J-5.positionnement").status == "A_ECHEANCE"
    refresh_all(demo, trigger="nuit", today=TODAY + timedelta(days=4))
    assert _status(demo, "SST-2026-04", "J-5.positionnement").status == "EN_RETARD"


def test_un_evenement_met_a_jour_l_echeancier(demo: Session) -> None:
    s = find_session(demo, "SST-2026-04")
    for e in s.enrollments:
        demo.add(t.Convocation(enrollment_id=e.id, sent_on=TODAY))
        publish(demo, "convocation.sent", "enrollment", e.id, session_id=s.id, program_id=s.program_id)
    demo.commit()
    process_pending(demo, today=TODAY)
    m = _status(demo, "SST-2026-04", "J-10.convocation")
    assert m.status == "FAIT" and (m.done, m.total) == (4, 4)


def test_convention_envoyee_non_signee_n_est_pas_une_preuve_exploitable(demo: Session) -> None:
    ev = demo.scalar(select(Evidence).where(Evidence.evidence_type == "AGREEMENT", Evidence.label.like("%Éric Chevalier%")))
    assert ev.status == "DETECTEE"
    assert ev.form_issues == ["convention envoyée, non signée"]


def test_fonction_pure_sans_objet_et_fait() -> None:
    m = MilestoneDef(key="X", label="X", anchor="end", offset_days=3, evidence="CERTIFICATE", enrollments=["TERMINE"], owner="gestion")
    s = t.TrainingSession(reference="S", start_date=date(2026, 1, 5), end_date=date(2026, 1, 9), enrollments=[])
    r = assess(m, s, [], today=date(2026, 1, 20))
    assert r["status"] == "SANS_OBJET" and r["due_on"] == date(2026, 1, 12)


def test_circuit_charge_et_valide() -> None:
    circuit = load_circuit()
    assert circuit.code == "STANDARD"
    assert [m.key for m in circuit.milestones][0] == "J-15.convention"


def test_api_echeances_et_dossier(demo: Session, client) -> None:  # noqa: ANN001
    _, lecture = make_user(demo, "lecture")
    rows = client.get("/api/v1/qualiopi/echeances", headers=lecture, params={"days": 0, "owner": "gestion"}).json()
    assert {(r["session"], r["key"]) for r in rows} >= {("SST-2026-04", "J-15.convention"), ("SST-2026-04", "J-10.convocation")}
    assert all(r["owner"] == "gestion" for r in rows)
    s = find_session(demo, "SST-2026-04")
    body = client.get(f"/api/v1/sessions/{s.id}/dossier", headers=lecture).json()
    assert [m["key"] for m in body["echeancier"]][:2] == ["J-15.convention", "J-10.convocation"]
