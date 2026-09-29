"""Revue humaine attestée : le jugement qualité enregistré, daté, justifié, et relié au circuit CAPA."""

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.core.journal import ChangeLog
from app.qualiopi.capa import service as capa
from app.qualiopi.evaluation.models import Finding
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.review.models import IndicatorReview
from app.qualiopi.review.service import record_review, review_state
from tests.conftest import TODAY, make_user

COMMENT = "Partenariats avec deux entreprises d'accueil vérifiés : conventions et comptes rendus de visite."


def _ind(db: Session, n: int) -> dict:
    return next(i for i in indicator_readiness(db, db.info["version"]) if i["number"] == n)


def test_indicateur_sans_controle_passe_de_revue_requise_a_faite(demo: Session) -> None:
    before = _ind(demo, 28)
    assert before["status"] == "NON_EVALUE" and before["revue_humaine"]["state"] == "REQUISE"
    assert before["human_validation_required"]
    record_review(demo, demo.info["version"], 28, conclusion="SATISFAISANT", comment=COMMENT, engine_status=before["status"],
                  evidence_refs=[], user_id="u1", user_name="Marie Qualité")
    demo.commit()
    after = _ind(demo, 28)
    assert after["status"] == "NON_EVALUE", "une revue ne change pas l'état calculé : elle s'y ajoute"
    assert after["revue_humaine"]["state"] == "FAITE" and after["revue_humaine"]["by"] == "Marie Qualité"
    assert not after["human_validation_required"]


def test_revue_non_justifiee_refusee(demo: Session) -> None:
    with pytest.raises(InvalidStateError, match="Justifiez"):
        record_review(demo, demo.info["version"], 28, conclusion="SATISFAISANT", comment="ok", engine_status="NON_EVALUE",
                      evidence_refs=[], user_id="u1", user_name="Q")
    with pytest.raises(InvalidStateError, match="Conclusion"):
        record_review(demo, demo.info["version"], 28, conclusion="CONFORME", comment=COMMENT, engine_status="NON_EVALUE",
                      evidence_refs=[], user_id="u1", user_name="Q")


def test_revue_insuffisante_ouvre_un_constat_clos_par_un_humain(demo: Session) -> None:
    review = record_review(demo, demo.info["version"], 19, conclusion="INSUFFISANT",
                           comment="L'inventaire existe mais les supports ne sont pas accessibles aux stagiaires en distanciel.",
                           engine_status="DEMONTRABLE", evidence_refs=[], user_id="u1", user_name="Marie Qualité", severity="majeure")
    f = demo.get(Finding, review.finding_id)
    assert (f.origin, f.indicator_number, f.severity) == ("REVUE", 19, "majeure")
    assert _ind(demo, 19)["revue_humaine"]["state"] == "INSUFFISANTE"
    action = capa.create_capa(demo, f.id, title="Ouvrir la plateforme aux stagiaires", action_plan="Accès LMS pour tous",
                              owner_name="Direction", due_on=TODAY + timedelta(days=30), root_cause=None, kind="CORRECTIVE", actor="Qualité")
    capa.complete(demo, action, "Accès ouverts", "Direction")
    with pytest.raises(InvalidStateError, match="note de vérification humaine"):
        capa.verify(demo, action, "Qualité")
    capa.verify(demo, action, "Qualité", human_note="Accès testés avec trois stagiaires le 29/09.")
    assert action.status == "CLOTUREE" and f.status == "RESOLU"


def test_revue_expiree() -> None:
    r = IndicatorReview(conclusion="SATISFAISANT", comment=COMMENT, reviewed_by="Q", reviewed_at=datetime(2025, 1, 1),
                        valid_until=date(2026, 1, 1))
    assert review_state(r, True, today=date(2026, 1, 2))["state"] == "EXPIREE"
    assert review_state(None, False)["state"] == "SANS_OBJET"


def test_api_revue_permissions_preuves_et_journal(demo: Session, client) -> None:  # noqa: ANN001
    _, lecture = make_user(demo, "lecture")
    _, qualite = make_user(demo, "qualite")
    body = {"conclusion": "SATISFAISANT", "comment": "Inventaire relu et supports vérifiés sur la plateforme."}
    assert client.post("/api/v1/qualiopi/indicateurs/19/revues", headers=lecture, json=body).status_code == 403
    assert client.post("/api/v1/qualiopi/indicateurs/99/revues", headers=qualite, json=body).status_code == 404
    r = client.post("/api/v1/qualiopi/indicateurs/19/revues", headers=qualite, json=body)
    assert r.status_code == 200, r.text
    assert len(r.json()["evidence_refs"]) == 1, "l'inventaire des ressources consulté est figé avec la revue"
    history = client.get("/api/v1/qualiopi/indicateurs/19/revues", headers=lecture).json()
    assert history[0]["engine_status"] == "DEMONTRABLE"
    log = demo.scalar(select(ChangeLog).where(ChangeLog.table_name == "qualite.indicator_review"))
    assert log.action == "CREATION" and log.actor == "Test qualite <qualite@test.local>"
