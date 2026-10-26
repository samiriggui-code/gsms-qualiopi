"""Outbox : un événement métier déclenche une réévaluation ciblée, une seule fois."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.qualiopi.engine import process_pending, refresh_all
from app.event.publish import publish
from app.types import training as t
from app.types.event import OutboxEvent
from app.types.qualiopi_evaluation import ControlResult, EvaluationRun
from app.types.qualiopi_evidence import Evidence
from tests.conftest import TODAY, find_session, make_user


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


def _trainer_evidence(db: Session, evidence_type: str, source_id: str) -> Evidence | None:
    return db.scalar(select(Evidence).where(Evidence.evidence_type == evidence_type, Evidence.source_id == source_id))


def test_titre_et_developpement_du_formateur_reevalues(client, demo: Session) -> None:  # noqa: ANN001
    """Les événements d'un titre ou d'une action de développement portent le formateur : ses preuves suivent."""
    _, h = make_user(demo, "gestion")
    trainer_id = find_session(demo, "SST-2026-04").trainer_id
    other_id = next(x.id for x in demo.scalars(select(t.Trainer)) if x.id != trainer_id)
    r = client.post("/api/v1/trainer-qualifications", headers=h,
                    json={"trainer_id": trainer_id, "label": "Recyclage SST", "obtained_on": TODAY.isoformat()})
    assert r.status_code == 201, r.text
    qualification_id = r.json()["id"]
    r = client.post("/api/v1/staff-development", headers=h,
                    json={"trainer_id": trainer_id, "label": "Formation de formateur", "completed_on": TODAY.isoformat()})
    assert r.status_code == 201, r.text
    action_id = r.json()["id"]

    result = process_pending(demo, today=TODAY)
    demo.commit()
    assert result["org"] is False, "un changement propre à un formateur ne réévalue pas tout l'organisme"
    assert _trainer_evidence(demo, "TRAINER_QUALIFICATION", qualification_id).trainer_id == trainer_id
    assert _trainer_evidence(demo, "STAFF_DEVELOPMENT", action_id).trainer_id == trainer_id

    # Titre rattaché à un autre formateur : l'ancien et le nouveau sont dans le périmètre, la preuve suit.
    r = client.patch(f"/api/v1/trainer-qualifications/{qualification_id}", headers=h, json={"trainer_id": other_id})
    assert r.status_code == 200, r.text
    process_pending(demo, today=TODAY)
    demo.commit()
    demo.expire_all()
    assert _trainer_evidence(demo, "TRAINER_QUALIFICATION", qualification_id).trainer_id == other_id


def test_titre_ajoute_depuis_la_fiche_rh_reevalue(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    _, hr = make_user(demo, "rh")
    client.put("/api/v1/features/hr", json={"enabled": True}, headers=ha)
    trainer_id = find_session(demo, "SST-2026-04").trainer_id
    r = client.post(f"/api/v1/formateurs/{trainer_id}/titres", headers=hr,
                    json={"kind": "AUTRE", "label": "Habilitation électrique", "obtained_on": TODAY.isoformat()})
    assert r.status_code == 201, r.text
    result = process_pending(demo, today=TODAY)
    demo.commit()
    assert result["events"] >= 1
    assert _trainer_evidence(demo, "TRAINER_QUALIFICATION", r.json()["id"]).trainer_id == trainer_id


def test_piece_retiree_de_la_configuration_ne_bloque_pas_la_reconciliation(demo: Session) -> None:
    """Une pièce déposée dont le code a disparu de config/dossiers n'est plus une preuve, sans faire échouer le lot."""
    org = demo.scalar(select(t.Organization))
    doc = t.Document(kind="PIECE", title="Ancienne pièce", entity_type="ORGANISME", entity_id=org.id, status="EMIS",
                     requirement="PIECE_RETIREE_DE_LA_CONFIGURATION")
    demo.add(doc)
    demo.flush()
    publish(demo, "document.issued", "document", doc.id)
    demo.commit()
    result = process_pending(demo, today=TODAY)
    demo.commit()
    assert result["events"] == 1 and result["org"] is True
    assert demo.scalar(select(Evidence).where(Evidence.source_id == doc.id)) is None
    assert refresh_all(demo, trigger="test", today=TODAY)["results"] > 0
