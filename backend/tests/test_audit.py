"""Audit interne : photo figée, jugement humain, constats d'audit, comparaison dans le temps."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.qualiopi.audit.service import close_audit, compare, create_audit, judge
from app.qualiopi.engine import refresh_all
from app.qualiopi.evaluation.models import Finding
from app.training import models as t
from tests.conftest import TODAY


def _audit(db: Session, title: str = "Audit blanc"):  # noqa: ANN202
    return create_audit(db, db.info["version"], title=title, kind="BLANC", auditor_name="Auditrice interne",
                        planned_on=TODAY, sample_session_ids=None, actor="Qualité")


def test_photo_figee_de_32_indicateurs(demo: Session) -> None:
    audit = _audit(demo)
    assert len(audit.items) == 32
    # Échantillon par défaut : sessions réalisées (terminée + en cours), pas la session future.
    refs = set(demo.scalars(select(t.TrainingSession.reference).where(t.TrainingSession.id.in_(audit.sample_session_ids))))
    assert refs == {"SSIAP1-2026-01", "SST-2026-02"}
    i08 = next(i for i in audit.items if i.indicator_number == 8)
    # Pire état de l'échantillon : 11/12 sur SSIAP1-2026-01, 3/3 sur SST-2026-02.
    assert i08.engine_readiness == "A_RISQUE"
    assert i08.snapshot["results"] and all("source_hash" in e for e in i08.snapshot["evidence"])


def test_cloture_exige_tous_les_jugements_et_cree_les_constats(demo: Session) -> None:
    audit = _audit(demo)
    with pytest.raises(InvalidStateError, match="motivée"):
        judge(demo, audit, 20, "NC_MINEURE", None, "Auditrice")
    for item in audit.items:
        judge(demo, audit, item.indicator_number, "CONFORME", None, "Auditrice")
    judge(demo, audit, 20, "NC_MINEURE", "Coordonnées du référent absentes des supports", "Auditrice")
    close_audit(demo, audit, "Audit blanc satisfaisant, une non-conformité mineure.", "Auditrice")
    demo.commit()
    f = demo.scalar(select(Finding).where(Finding.origin == "AUDIT"))
    assert f.indicator_number == 20 and f.severity == "mineure"
    with pytest.raises(InvalidStateError, match="clos"):
        judge(demo, audit, 1, "CONFORME", None, "Auditrice")


def test_comparaison_de_deux_audits(demo: Session) -> None:
    first = _audit(demo, "Audit janvier")
    demo.scalar(select(t.Organization)).disability_referent_email = "referent.handicap@exemple.fr"
    refresh_all(demo, trigger="test", today=TODAY)
    second = _audit(demo, "Audit mars")
    rows = {r["indicator"]: r for r in compare([second, first])}
    assert [p["audit"] for p in rows[20]["points"]] == [first.reference, second.reference]
    assert [p["engine"] for p in rows[20]["points"]] == ["PREUVES_INSUFFISANTES", "DEMONTRABLE"]
