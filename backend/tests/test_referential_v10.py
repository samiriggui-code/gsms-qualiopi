"""Référentiel V10 (décret n° 2026-728) : texte officiel, applicabilité, bascule datée, nouveaux contrôles."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.documents.service import upload
from app.qualiopi.evaluation.models import ControlResult
from app.qualiopi.evaluation.service import evaluate, indicator_readiness
from app.qualiopi.evidence.service import Scope, reconcile
from app.qualiopi.referential.importer import activate_due, active_version, import_referential, load_referential
from app.training import models as t
from tests.conftest import TODAY, V9

V10 = V9.parent / "v10"
VEILLE = date(2026, 10, 31)
BASCULE = date(2026, 11, 1)
PDF = b"%PDF-1.4\n% procedure\n%%EOF\n"


def test_source_officielle_33_indicateurs() -> None:
    parsed = load_referential(V10)
    assert sorted(parsed.source) == list(range(1, 34))
    assert parsed.meta["effective_from"] == BASCULE
    assert parsed.upstream_ref.startswith("JORFTEXT000054608509")
    enonce = dict(parsed.source[12].sections)["Énoncé"]
    assert "violences sexistes et sexuelles" in enonce
    assert "analyse des risques sur la qualité" in dict(parsed.source[32].sections)["Énoncé"]
    # Seul l'énoncé est exigé : le guide de lecture V10 n'est pas publié.
    assert all("Exemples de preuves" not in dict(s.sections) for s in parsed.source.values())


def test_indicateurs_specifiques_apprentissage() -> None:
    norm = load_referential(V10).normative
    for n in (14, 15, 20, 29, 33):
        assert norm[n]["applicability"] == {"action_categories": ["APPRENTISSAGE"]}, n
    assert norm[3]["applicability"]["action_categories"] == ["AF", "VAE", "APPRENTISSAGE"]
    assert norm[8]["applicability"]["action_categories"] == ["AF", "APPRENTISSAGE"]


def test_v10_reste_inactif_avant_le_1er_novembre(db: Session) -> None:
    v9 = import_referential(db, V9, today=VEILLE)
    v10 = import_referential(db, V10, today=VEILLE)
    db.commit()
    assert v9.is_active and not v10.is_active
    assert activate_due(db, today=VEILLE) is None
    assert activate_due(db, today=BASCULE).id == v10.id
    db.commit()
    assert active_version(db).version == "V10" and not v9.is_active
    assert activate_due(db, today=BASCULE) is None, "déjà active : rien ne change"


def _evaluate_v10(demo: Session):  # noqa: ANN202
    v10 = import_referential(demo, V10, today=TODAY)
    activate_due(demo, today=BASCULE)
    reconcile(demo, v10, today=TODAY, scope=Scope.everything())
    evaluate(demo, v10, trigger="test", today=TODAY)
    demo.commit()
    return v10


def _result(db: Session, version, key: str) -> ControlResult:  # noqa: ANN001
    return db.scalar(select(ControlResult).where(ControlResult.version_id == version.id, ControlResult.control_key == key))


def test_demo_evaluee_en_v10(demo: Session) -> None:
    v10 = _evaluate_v10(demo)
    status = {r["number"]: r["status"] for r in indicator_readiness(demo, v10)}
    assert len(status) == 33
    for n in (14, 15, 20, 29, 33):
        assert status[n] == "NON_APPLICABLE", f"I{n} est réservé à l'apprentissage"
    violences = _result(demo, v10, "I12.violence-prevention")
    assert violences.target_type == "ORGANISME" and violences.status == "PREUVES_INSUFFISANTES"
    assert _result(demo, v10, "I32.risk-analysis").status == "PREUVES_INSUFFISANTES"
    assert _result(demo, v10, "I26.disability-referent").status == "PREUVES_INSUFFISANTES"


def test_procedure_violences_deposee_rend_l_exigence_demontrable(demo: Session) -> None:
    org = demo.scalar(select(t.Organization))
    upload(demo, subject="ORGANISME", subject_id=org.id, requirement="PROCEDURE_VIOLENCES_DISCRIMINATIONS",
           content=PDF, filename="procedure.pdf", mime="application/pdf")
    v10 = _evaluate_v10(demo)
    assert _result(demo, v10, "I12.violence-prevention").status == "DEMONTRABLE"
