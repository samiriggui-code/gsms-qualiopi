"""Outbox : un événement métier déclenche une réévaluation ciblée, une seule fois."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.events.models import OutboxEvent
from app.events.publish import publish
from app.qualiopi.engine import process_pending
from app.qualiopi.evaluation.models import ControlResult, EvaluationRun
from app.qualiopi.evidence.models import Evidence
from app.training import models as t
from tests.conftest import TODAY, find_session


def _add_positioning(db: Session) -> t.TrainingSession:
    """Corrige le trou I08 : Adam Nicolas reçoit son positionnement."""
    s = find_session(db, "SSIAP1-2026-01")
    enrollment = next(e for e in s.enrollments if e.learner.last_name == "Nicolas")
    p = t.Positioning(enrollment_id=enrollment.id, method="QCM", completed_on=s.start_date, level="débutant")
    db.add(p)
    db.flush()
    publish(db, "positioning.completed", "positioning", p.id, session_id=s.id, program_id=s.program_id)
    return s


def test_evenement_inconnu_refuse(demo: Session) -> None:
    with pytest.raises(ValueError, match="inconnu"):
        publish(demo, "session.teleportee", "session", "x")


def test_reevaluation_ciblee_puis_idempotente(demo: Session) -> None:
    s = _add_positioning(demo)
    demo.commit()

    result = process_pending(demo, today=TODAY)
    demo.commit()
    assert result["events"] == 1 and result["sessions"] == 1 and result["org"] is False
    run = demo.get(EvaluationRun, result["run_id"])
    assert run.scope == "CIBLE" and run.target_id == s.id
    assert run.trigger == "event:positioning.completed"

    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I08.positioning-before-start", ControlResult.target_id == s.id))
    assert r.status == "DEMONTRABLE" and r.observed == "12/12"

    # Les autres sessions n'ont pas été réévaluées par ce run.
    other = find_session(demo, "SST-2026-02")
    assert all(x.run_id != run.id for x in demo.scalars(select(ControlResult).where(ControlResult.session_id == other.id)))

    assert process_pending(demo, today=TODAY) == {"events": 0}
    pending = demo.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.processed_at.is_(None)))
    assert pending == 0


def test_evenement_organisme_reevalue_l_organisme(demo: Session) -> None:
    org = demo.scalar(select(t.Organization))
    org.disability_referent_email = "referent.handicap@exemple.fr"
    publish(demo, "organization.updated", "organization", org.id)
    demo.commit()
    result = process_pending(demo, today=TODAY)
    demo.commit()
    assert result["org"] is True
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I26.disability-referent"))
    assert r.status == "DEMONTRABLE"


def test_formation_sans_session_reevaluee(demo: Session) -> None:
    p = t.Program(code="HOBO", title="Habilitation électrique", objectives=["Travailler hors tension en sécurité"])
    demo.add(p)
    demo.flush()
    publish(demo, "program.created", "program", p.id, program_id=p.id)
    demo.commit()
    result = process_pending(demo, today=TODAY)
    assert result["programs"] == 1 and result["sessions"] == 0
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I05.objectives", ControlResult.target_id == p.id))
    assert r is not None and r.status == "DEMONTRABLE"


def test_reconciliation_ciblee_ne_retire_rien_hors_perimetre(demo: Session) -> None:
    before = {e.id: e.status for e in demo.scalars(select(Evidence))}
    _add_positioning(demo)
    demo.commit()
    result = process_pending(demo, today=TODAY)
    demo.commit()
    assert result["evidence"]["retired"] == 0 and result["evidence"]["created"] == 1
    after = {e.id: e.status for e in demo.scalars(select(Evidence))}
    assert {k: v for k, v in after.items() if k in before} == before
