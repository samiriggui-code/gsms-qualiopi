"""Période évaluée : un vieux trou ne rend pas l'organisme rouge à vie."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.qualiopi.audit.service import create_audit
from app.qualiopi.cycle.service import ALL_TIME, create_cycle, resolve_period
from app.qualiopi.evaluation.service import indicator_readiness
from app.training import models as t
from tests.conftest import TODAY, find_session, make_user


def _status(db: Session, n: int, period) -> str:  # noqa: ANN001
    return next(i for i in indicator_readiness(db, db.info["version"], period=period) if i["number"] == n)["status"]


def _cycle_after_ssiap1(db: Session):  # noqa: ANN202
    # SSIAP1-2026-01 s'est terminée à J-36 : un cycle ouvert à J-30 ne la compte plus.
    return create_cycle(db, label="Surveillance 2027", kind="SURVEILLANCE", period_start=TODAY - timedelta(days=30),
                        period_end=None, audit_on=TODAY + timedelta(days=60), certifier="Organisme certificateur", notes=None)


def test_sans_cycle_toute_l_activite_compte(demo: Session) -> None:
    period = resolve_period(demo, today=TODAY)
    assert period == ALL_TIME
    assert _status(demo, 8, period) == "A_RISQUE"


def test_un_cycle_exclut_les_sessions_anterieures(demo: Session) -> None:
    _cycle_after_ssiap1(demo)
    period = resolve_period(demo, today=TODAY)
    assert period.label == "Surveillance 2027"
    assert _status(demo, 8, period) != "A_RISQUE", "le positionnement manquant d'une session hors période ne compte plus"
    assert _status(demo, 4, period) == "PREUVES_INSUFFISANTES", "SST-2026-02 est dans la période"
    assert _status(demo, 26, period) == "PREUVES_INSUFFISANTES", "l'organisme compte toujours"


def test_periode_explicite_prioritaire(demo: Session) -> None:
    _cycle_after_ssiap1(demo)
    s1 = find_session(demo, "SSIAP1-2026-01")
    period = resolve_period(demo, s1.start_date, s1.end_date, today=TODAY)
    assert _status(demo, 8, period) == "A_RISQUE"
    with pytest.raises(InvalidStateError):
        resolve_period(demo, s1.end_date, s1.start_date)


def test_echantillon_d_audit_dans_la_periode(demo: Session) -> None:
    _cycle_after_ssiap1(demo)
    audit = create_audit(demo, demo.info["version"], title="Audit blanc", kind="BLANC", auditor_name="Auditrice",
                         planned_on=TODAY, sample_session_ids=None, actor="Qualité")
    refs = {demo.get(t.TrainingSession, sid).reference for sid in audit.sample_session_ids}
    assert refs == {"SST-2026-02"}
    assert audit.period_start == TODAY - timedelta(days=30) and audit.period_end is None


def test_cycle_invalide_refuse(demo: Session) -> None:
    with pytest.raises(InvalidStateError, match="Type"):
        create_cycle(demo, label="x", kind="ANNUEL", period_start=TODAY, period_end=None, audit_on=None, certifier=None, notes=None)
    with pytest.raises(InvalidStateError, match="précède"):
        create_cycle(demo, label="x", kind="INTERNE", period_start=TODAY, period_end=TODAY - timedelta(days=1),
                     audit_on=None, certifier=None, notes=None)


def test_api_cycles_et_readiness(demo: Session, client) -> None:  # noqa: ANN001
    _, gestion = make_user(demo, "gestion")
    _, qualite = make_user(demo, "qualite")
    body = {"label": "Renouvellement 2029", "kind": "RENOUVELLEMENT", "period_start": str(TODAY - timedelta(days=30))}
    assert client.post("/api/v1/qualiopi/cycles", headers=gestion, json=body).status_code == 403
    assert client.post("/api/v1/qualiopi/cycles", headers=qualite, json=body).status_code == 200
    r = client.get("/api/v1/qualiopi/readiness", headers=gestion).json()
    assert r["periode"]["label"] == "Renouvellement 2029"
    r = client.get("/api/v1/qualiopi/readiness", headers=gestion, params={"du": "2020-01-01", "au": "2030-12-31"}).json()
    assert r["periode"]["label"] == "Période choisie"
