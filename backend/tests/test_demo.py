"""Contrat de la démo : le moteur trouve les 14 trous plantés, et rien d'autre.

C'est la condition de sortie du jalon 1 : chaque trou planté produit le bon résultat,
explicable, dans le dossier de session renvoyé par l'API.
"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.demo import PLANTED_GAPS, seed_demo
from app.application.service.qualiopi.engine import refresh_all
from app.application.service.qualiopi.evaluation.service import indicator_readiness
from app.application.service.qualiopi.referential.importer import import_referential
from app.errors.errors import ConflictError
from app.types.qualiopi_evaluation import ControlResult, Finding
from app.types.qualiopi_evidence import Evidence
from app.types.qualiopi_schedule import MilestoneStatus
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


def test_demo_refusee_si_deja_installee(demo: Session) -> None:
    with pytest.raises(ConflictError):
        seed_demo(demo, today=TODAY)


def test_exemples_sur_un_organisme_existant_puis_retrait(db: Session) -> None:
    """Base déjà remplie (organisme et formation importés) : les exemples s'y ajoutent, puis repartent seuls."""
    from app.application.service.demo import remove_demo
    from app.types import training as t
    from tests.conftest import V9

    import_referential(db, V9)
    org = t.Organization(name="Organisme réel", created_by="import")
    real = t.Program(code="REEL", title="Formation importée", created_by="import")
    db.add_all([org, real])
    db.flush()
    refresh_all(db, trigger="test", today=TODAY)
    before = db.scalar(select(func.count()).select_from(Evidence))

    seed_demo(db, today=TODAY)
    refresh_all(db, trigger="test", today=TODAY)
    assert db.scalars(select(t.Organization.name)).all() == ["Organisme réel"]
    assert db.scalar(select(func.count()).select_from(t.TrainingSession)) == 6

    removed = remove_demo(db)
    refresh_all(db, trigger="test", today=TODAY)
    db.commit()
    assert removed["session"] == 6 and removed["learner"] == 22
    for model in (t.TrainingSession, t.Learner, t.Trainer, t.Enrollment, t.Complaint):
        assert db.scalar(select(func.count()).select_from(model)) == 0, model
    assert db.scalars(select(t.Program.code)).all() == ["REEL"]
    assert db.scalars(select(t.Organization.name)).all() == ["Organisme réel"]
    assert db.scalar(select(func.count()).select_from(Evidence)) == before
    assert not db.scalar(select(func.count()).select_from(Finding).where(Finding.session_id.is_not(None)))
    assert removed["milestone_status"] > 0
    assert not db.scalar(select(func.count()).select_from(MilestoneStatus)), "pas d'échéance orpheline (synthèse hebdo)"
    # Réinstallables ensuite
    seed_demo(db, today=TODAY)


def test_exemples_des_pages_ressources_rh_financement_puis_retrait(db: Session) -> None:
    """Modules RH et financement actifs : lieux, équipements, sous-traitants, partenaires, personnel, dossiers de
    financement et un conflit de salle à venir ; les trous plantés ne bougent pas ; `remove_demo` retire tout, et
    rien de ce qui a été saisi à côté."""
    from datetime import timedelta

    from app.application.service.demo import remove_demo
    from app.application.service.pilotage.planning import planning
    from app.application.service.platform.features import set_feature
    from app.types import training as t
    from app.types.funding import FundingCase, FundingSource
    from app.types.hr import StaffAbsence, StaffMember
    from tests.conftest import V9

    for code in ("hr", "funding", "funding.cpf", "funding.opco"):
        set_feature(db, code, True)
    import_referential(db, V9)
    real_place = t.Premises(code="REEL-SALLE", name="Salle réelle", created_by="import")
    real_staff = StaffMember(first_name="Réel", last_name="Salarié", created_by="admin")
    real_sub = t.Subcontractor(name="Sous-traitant réel", qualiopi_certified=True, contract_signed_on=TODAY, created_by="admin")
    db.add_all([real_place, real_staff, real_sub])
    db.flush()
    info = seed_demo(db, today=TODAY)
    refresh_all(db, trigger="test", today=TODAY)
    db.commit()

    assert info["funding_cases"] == 4
    names = _names(db)
    found = {(r.control_key, names.get(r.target_id, "organisme"), r.status)
             for r in db.scalars(select(ControlResult)) if r.status not in OK}
    assert found == {(g.control, g.target, g.status) for g in PLANTED_GAPS}, "les exemples ajoutés ne plantent aucun trou"

    demo = t.Premises.created_by == "démo"
    assert db.scalar(select(func.count()).select_from(t.Premises).where(demo)) == 7
    checks = {e.code: e.next_check_on for e in db.scalars(select(t.Equipment))}
    assert checks["DEMO-EXTINCTEURS"] < TODAY, "une vérification échue"
    assert TODAY <= checks["DEMO-DEFIBRILLATEURS"] <= TODAY + timedelta(days=30), "une vérification proche"
    subs = {s.name: s.qualiopi_certified for s in db.scalars(select(t.Subcontractor).where(t.Subcontractor.created_by == "démo"))}
    assert sorted(subs.values()) == [False, True]
    assert {p.kind for p in db.scalars(select(t.PartnerNetwork))} == {"HANDICAP", "SOCIO_ECONOMIQUE"}
    assert db.scalar(select(func.count()).select_from(StaffMember).where(StaffMember.created_by == "démo")) == 5
    assert db.scalar(select(func.count()).select_from(StaffAbsence)) == 1
    soon = db.scalars(select(t.TrainerQualification.label).where(
        t.TrainerQualification.valid_until.between(TODAY, TODAY + timedelta(days=90)))).all()
    assert soon == ["Habilitation électrique H0B0"], "un titre à renouveler"
    states = {(s.scheme, s.state) for s in db.scalars(select(FundingSource))}
    assert states == {("OPCO", "REALISEE"), ("ENTREPRISE", "CONVENTION_SIGNEE"), ("CPF", "ACCEPTEE"), ("OPCO", "DEPOSEE")}

    user, _ = make_user(db, "gestion")
    plan = planning(db, user, TODAY, TODAY + timedelta(days=30))
    assert [(c["type"], sorted(c["sessions"])) for c in plan["conflits"]] == [("SALLE", ["MAC-SST-2026-01", "SST-2026-05"])]

    removed = remove_demo(db)
    refresh_all(db, trigger="test", today=TODAY)
    db.commit()
    assert removed["funding_case"] == 4 and removed["staff_member"] == 5 and removed["premises"] == 7
    for model in (t.Equipment, FundingCase, FundingSource, StaffAbsence, t.PartnerNetwork, t.SatisfactionSurvey,
                  t.TrainerQualification, t.StaffDevelopmentAction):
        assert db.scalar(select(func.count()).select_from(model)) == 0, model
    assert db.scalars(select(t.Premises.code)).all() == ["REEL-SALLE"]
    assert db.scalars(select(StaffMember.last_name)).all() == ["Salarié"]
    assert db.scalars(select(t.Subcontractor.name)).all() == ["Sous-traitant réel"]


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
    assert {f"I{f['indicator']:02d}" for f in body["findings"]} == {c.split(".")[0] for c in session_gaps}
    assert not any(f["title"].startswith("I") and " — " in f["title"][:6] for f in body["findings"]), "pas de code en titre"
    assert "seul l'organisme certificateur" in body["disclaimer"]
