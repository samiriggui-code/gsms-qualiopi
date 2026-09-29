"""Contrat de la démo : le moteur trouve les 14 trous plantés, et rien d'autre.

C'est la condition de sortie du jalon 1 : chaque trou planté produit le bon résultat,
explicable, dans le dossier de session renvoyé par l'API.
"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError
from app.demo import PLANTED_GAPS, seed_demo
from app.qualiopi.engine import refresh_all
from app.qualiopi.evaluation.models import ControlResult, Finding
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.models import Evidence
from tests.conftest import TODAY, make_user
from tests.conftest import find_session as _session
from tests.conftest import target_names as _names

OK = ("DEMONTRABLE", "NON_APPLICABLE")




def test_le_moteur_trouve_exactement_les_trous_plantes(demo: Session) -> None:
    names = _names(demo)
    found = {
        (r.control_key, names.get(r.target_id, "organisme"), r.status)
        for r in demo.scalars(select(ControlResult))
        if r.status not in OK
    }
    expected = {(g.control, g.target, g.status) for g in PLANTED_GAPS}
    assert found == expected


def test_un_constat_par_trou(demo: Session) -> None:
    assert demo.scalar(select(func.count()).select_from(Finding)) == len(PLANTED_GAPS)


def test_i18_i19_verifies_par_le_dossier_de_pieces(demo: Session) -> None:
    rows = {i["number"]: i for i in indicator_readiness(demo, demo.info["version"])}
    assert rows[19]["status"] == "DEMONTRABLE" and rows[19]["automated"]
    assert rows[18]["status"] == "PREUVES_INSUFFISANTES"


def test_reevaluation_idempotente(demo: Session) -> None:
    stats = refresh_all(demo, trigger="test", today=TODAY)
    demo.commit()
    assert stats["evidence"]["created"] == 0 and stats["evidence"]["changed"] == 0
    assert demo.scalar(select(func.count()).select_from(Finding)) == len(PLANTED_GAPS)


def test_explication_nomme_l_apprenant_manquant(demo: Session) -> None:
    s = _session(demo, "SSIAP1-2026-01")
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I08.positioning-before-start", ControlResult.target_id == s.id))
    assert r.observed == "11/12"
    assert [m["who"] for m in r.missing] == ["Adam Nicolas"]
    assert "Adam Nicolas" in r.explanation
    assert len(r.evidence_ids) == 11, "les 11 preuves analysées sont citées"


def test_emargement_abandon_compte_jusqu_a_sa_date(demo: Session) -> None:
    s = _session(demo, "SSIAP1-2026-01")
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I12.attendance", ControlResult.target_id == s.id))
    # 12 × 10 demi-journées + 3 pour l'abandon (parti le 2e jour à midi : l'après-midi n'est plus
    # attendue) ; seule la demi-journée de Chloé Blanc manque.
    assert r.observed == "122/123 signatures (99%)"


def test_abandon_absent_n_est_pas_un_trou(demo: Session) -> None:
    s = _session(demo, "SST-2026-02")
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I12.dropouts", ControlResult.target_id == s.id))
    assert r.status == "NON_APPLICABLE"


def test_etats_des_indicateurs_sans_controle_actif(demo: Session) -> None:
    rows = {i["number"]: i for i in indicator_readiness(demo, demo.info["version"], session=_session(demo, "SSIAP1-2026-01"))}
    # Apprentissage : hors périmètre d'un organisme AF, même si un contrôle « nouvel entrant » existe.
    for n in (13, 14, 15, 29):
        assert rows[n]["status"] == "NON_APPLICABLE", n
    # Revue humaine seule : jamais « non évaluable ».
    for n in (28,):
        assert rows[n]["status"] == "NON_EVALUE" and rows[n]["human_validation_required"], n
    assert not any(i["status"] == "NON_EVALUABLE" for i in rows.values())


def test_session_future_rien_d_exigible(demo: Session) -> None:
    s = _session(demo, "SSIAP1-2026-03")
    rows = demo.scalars(select(ControlResult).where(ControlResult.session_id == s.id)).all()
    assert rows and all(r.status == "NON_APPLICABLE" for r in rows)


def test_preuve_tracable(demo: Session) -> None:
    ev = demo.scalar(select(Evidence).where(Evidence.evidence_type == "TRAINER_QUALIFICATION", Evidence.label.like("SSIAP 3%")))
    assert ev.reference.startswith("EV-")
    assert ev.source_table == "formation.trainer_qualification"
    assert ev.produced_by == "démo" and ev.produced_on is not None
    assert ev.document_sha256 and len(ev.source_hash) == 64
    assert [h.kind for h in ev.history] == ["DETECTED"]
    assert {link.indicator_number for link in ev.links} == {21}


def test_demo_refusee_sur_base_non_vide(demo: Session) -> None:
    with pytest.raises(ConflictError):
        seed_demo(demo, today=TODAY)


def test_dossier_de_session_par_api(demo: Session, client) -> None:  # noqa: ANN001
    _, lecture = make_user(demo, "lecture")
    s = _session(demo, "SSIAP1-2026-01")
    r = client.get(f"/api/v1/sessions/{s.id}/dossier", headers=lecture)
    assert r.status_code == 200, r.text
    body = r.json()
    lines = {line["label"]: line for line in body["checklist"]}
    assert (lines["Positionnements"]["done"], lines["Positionnements"]["total"]) == (11, 12)
    assert (lines["Émargements"]["done"], lines["Émargements"]["total"]) == (122, 123)
    assert (lines["Satisfaction à chaud"]["done"], lines["Satisfaction à chaud"]["total"]) == (10, 12)
    by_number = {i["number"]: i for i in body["indicators"]}
    assert by_number[8]["status"] == "A_RISQUE"
    assert by_number[8]["results"][0]["missing"][0]["who"] == "Adam Nicolas"
    session_gaps = {g.control for g in PLANTED_GAPS if g.target == "SSIAP1-2026-01"}
    assert {f["title"].split(" — ")[0] for f in body["findings"]} == {c.split(".")[0] for c in session_gaps}
    assert "seul l'organisme certificateur" in body["disclaimer"]
