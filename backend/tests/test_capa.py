"""CAPA : constat → action → réalisation → vérification d'efficacité par le moteur → clôture."""

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.events.models import OutboxEvent
from app.qualiopi.capa import service as capa
from app.qualiopi.engine import process_pending, refresh_all
from app.qualiopi.evaluation.models import ControlResult, Finding
from app.training import models as t
from tests.conftest import TODAY


def _finding(db: Session, control_key: str) -> Finding:
    return db.scalar(select(Finding).where(Finding.control_key == control_key))


def _open_capa(db: Session, finding: Finding) -> capa.CapaAction:
    return capa.create_capa(
        db, finding.id, title="Compléter les coordonnées du référent", action_plan="Ajouter l'e-mail du référent handicap",
        owner_name="Direction", due_on=TODAY + timedelta(days=15), root_cause="Fiche organisme incomplète",
        kind="CORRECTIVE", actor="Qualité",
    )


def test_cloture_uniquement_si_le_controle_passe(demo: Session) -> None:
    f = _finding(demo, "I26.disability-referent")
    action = _open_capa(demo, f)
    assert f.status == "EN_TRAITEMENT"
    capa.start(demo, action, "Direction")
    capa.complete(demo, action, "Fait", "Direction")

    # Rien n'a été corrigé : la vérification est demandée au moteur, qui la fait échouer.
    capa.verify(demo, action, "Qualité")
    assert action.status == "A_VERIFIER", "l'API ne clôt pas : elle demande une réévaluation"
    demo.commit()
    result = process_pending(demo, today=TODAY)
    assert result["capa_verified"] == [action.reference]
    assert action.status == "EN_COURS"
    assert action.verification_result.startswith("Échec")

    demo.scalar(select(t.Organization)).disability_referent_email = "referent.handicap@exemple.fr"
    capa.complete(demo, action, "E-mail ajouté", "Direction")
    capa.verify(demo, action, "Qualité")
    demo.commit()
    process_pending(demo, today=TODAY)
    demo.commit()
    assert action.status == "CLOTUREE"
    assert action.verified_by == "Qualité"
    assert f.status == "RESOLU"
    assert demo.scalar(select(OutboxEvent).where(OutboxEvent.name == "capa.closed")) is not None


def test_une_capa_cloturee_devient_preuve_d_amelioration_i32(demo: Session) -> None:
    f = _finding(demo, "I26.disability-referent")
    action = _open_capa(demo, f)
    capa.start(demo, action, "Direction")
    demo.scalar(select(t.Organization)).disability_referent_email = "referent.handicap@exemple.fr"
    capa.complete(demo, action, "E-mail ajouté", "Direction")
    capa.verify(demo, action, "Qualité")
    process_pending(demo, today=TODAY)
    refresh_all(demo, trigger="test", today=TODAY)
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I32.improvement"))
    assert r.status == "DEMONTRABLE"
    assert _finding(demo, "I32.improvement").status == "RESOLU"


def test_transition_interdite(demo: Session) -> None:
    action = _open_capa(demo, _finding(demo, "I26.disability-referent"))
    capa.start(demo, action, "Direction")
    with pytest.raises(InvalidStateError, match="interdite"):
        capa.start(demo, action, "Direction")
    with pytest.raises(InvalidStateError, match="A_VERIFIER"):
        capa.verify(demo, action, "Qualité")


def test_constat_resolu_sans_capa(demo: Session) -> None:
    f = _finding(demo, "I26.disability-referent")
    f.status = "RESOLU"
    with pytest.raises(InvalidStateError):
        _open_capa(demo, f)


def test_verification_ciblee_sur_une_formation(demo: Session) -> None:
    f = _finding(demo, "I01.public-info")
    assert f.target_type == "FORMATION"
    action = _open_capa(demo, f)
    program = demo.get(t.Program, f.target_id)
    program.accessibility_info = "Locaux accessibles, référente handicap joignable."
    capa.complete(demo, action, "Rubrique ajoutée", "Direction")
    capa.verify(demo, action, "Qualité")
    demo.commit()
    result = process_pending(demo, today=TODAY)
    assert result["org"] is False and result["programs"] == 1
    assert action.status == "CLOTUREE"


def test_verification_rejouee_sans_effet(demo: Session) -> None:
    action = _open_capa(demo, _finding(demo, "I26.disability-referent"))
    demo.scalar(select(t.Organization)).disability_referent_email = "referent.handicap@exemple.fr"
    capa.complete(demo, action, "E-mail ajouté", "Direction")
    capa.verify(demo, action, "Qualité")
    process_pending(demo, today=TODAY)
    assert capa.conclude_verification(demo, action.id).status == "CLOTUREE"
    assert sum(1 for e in action.events if e.kind == "STATUS:CLOTUREE") == 1
