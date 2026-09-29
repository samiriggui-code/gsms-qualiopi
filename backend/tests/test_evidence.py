"""Cycle de vie d'une preuve : détection, validation humaine, modification de la source, expiration, retrait."""

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.qualiopi.evidence.models import Evidence, EvidenceValidation
from app.qualiopi.evidence.service import reconcile, validate
from app.training import models as t
from tests.conftest import TODAY, find_session


def _positioning_evidence(db: Session, learner_last_name: str) -> tuple[Evidence, t.Positioning]:
    s = find_session(db, "SSIAP1-2026-01")
    enrollment = next(e for e in s.enrollments if e.learner.last_name == learner_last_name)
    ev = db.scalar(select(Evidence).where(Evidence.evidence_type == "POSITIONING", Evidence.enrollment_id == enrollment.id))
    return ev, enrollment.positioning


def test_validation_humaine_tracee(demo: Session) -> None:
    ev, _ = _positioning_evidence(demo, "Durand")
    assert ev.status == "EXPLOITABLE"
    validate(demo, ev.id, "VALIDEE", "Test d'entrée conforme", "u1", "Responsable qualité")
    demo.commit()
    assert ev.status == "VALIDEE"
    v = demo.scalar(select(EvidenceValidation).where(EvidenceValidation.evidence_id == ev.id))
    assert v.by_name == "Responsable qualité" and v.source_hash == ev.source_hash
    assert [h.kind for h in ev.history] == ["DETECTED", "VALIDATED"]


def test_rejet_sans_motif_refuse(demo: Session) -> None:
    ev, _ = _positioning_evidence(demo, "Durand")
    with pytest.raises(InvalidStateError, match="motif"):
        validate(demo, ev.id, "REJETEE", "  ", "u1", "Qualité")


def test_preuve_incomplete_non_validable(demo: Session) -> None:
    ev = demo.scalar(select(Evidence).where(Evidence.evidence_type == "WATCH", Evidence.status == "DETECTEE"))
    assert ev is not None, "la veille métiers non exploitée est une preuve détectée mais incomplète"
    with pytest.raises(InvalidStateError, match="corrigez"):
        validate(demo, ev.id, "VALIDEE", None, "u1", "Qualité")


def test_modifier_la_source_annule_la_validation(demo: Session) -> None:
    version = demo.info["version"]
    ev, positioning = _positioning_evidence(demo, "Durand")
    validate(demo, ev.id, "VALIDEE", None, "u1", "Qualité")
    positioning.level = "intermédiaire"
    stats = reconcile(demo, version, today=TODAY)
    demo.commit()
    assert stats["changed"] == 1
    assert ev.status == "EXPLOITABLE", "une donnée modifiée après validation doit être revalidée"
    assert ev.history[-1].kind == "SOURCE_CHANGED"
    assert "validation humaine à refaire" in ev.history[-1].detail


def test_expiration_s_applique_meme_apres_validation(demo: Session) -> None:
    version = demo.info["version"]
    ev = demo.scalar(select(Evidence).where(Evidence.evidence_type == "TRAINER_QUALIFICATION", Evidence.label.like("SSIAP 3%")))
    validate(demo, ev.id, "VALIDEE", None, "u1", "Qualité")
    reconcile(demo, version, today=TODAY + timedelta(days=401))
    assert ev.status == "EXPIREE"
    assert ev.history[-1].kind == "EXPIRED"


def test_suppression_de_la_source_retire_la_preuve(demo: Session) -> None:
    version = demo.info["version"]
    ev, positioning = _positioning_evidence(demo, "Durand")
    demo.delete(positioning)
    demo.flush()
    stats = reconcile(demo, version, today=TODAY)
    assert stats["retired"] == 1
    assert ev.status == "RETIREE"
    assert ev.history[-1].kind == "SOURCE_DELETED"
