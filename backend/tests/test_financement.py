"""Financement : cofinancement, circuits CPF / OPCO / entreprise / reste à charge, règles datées, droits."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from app.funding import service
from app.funding.policy import case_status
from app.platform.decisions import PolicyDenied
from app.platform.features import set_feature
from app.training import models as t
from tests.conftest import TODAY, find_session, make_user


def _enable(db: Session, *codes: str) -> None:
    for code in ("funding", *codes):
        set_feature(db, code, True)
    db.commit()


def _enrollment(db: Session, reference: str, index: int = 0):  # noqa: ANN202
    return [e for e in find_session(db, reference).enrollments if e.status != "ANNULE"][index]


def test_cofinancement_statut_calcule_et_sur_financement_bloque(demo: Session) -> None:
    _enable(demo, "funding.cpf")
    user, _ = make_user(demo, "financement")
    e = _enrollment(demo, "SST-2026-02")
    if e.agreement is None:
        demo.add(t.Agreement(enrollment_id=e.id, signed_on=TODAY - timedelta(days=20)))
    elif not e.agreement.signed_on:
        e.agreement.signed_on = TODAY - timedelta(days=20)
    demo.flush()
    demo.refresh(e)
    case = service.open_case(demo, e, 600, user)
    cpf = service.add_source(demo, case, "CPF", user)
    assert case_status(case)["statut"] == "PENDING"
    service.apply(demo, cpf, "accepter", {"external_ref": "EDOF-123", "amount_granted": 400}, user)
    status = case_status(case)
    assert (status["statut"], status["reste_a_financer"]) == ("PARTIALLY_FUNDED", "200.00")

    ent = service.add_source(demo, case, "ENTREPRISE", user, payer_name="ACME Sécurité")
    assert (ent.payer_kind, ent.payer_name, ent.invoice_recipient) == ("ENTREPRISE", "ACME Sécurité", "ACME Sécurité")
    with pytest.raises(PolicyDenied) as exc:
        service.apply(demo, ent, "signer", {"amount_granted": 250}, user)
    assert exc.value.code == "OVERFUNDED"
    service.apply(demo, ent, "signer", {"amount_granted": 200}, user)
    assert case_status(case)["statut"] == "FUNDED"


def test_circuit_cpf_conditions_echeances_et_prorata(client, demo: Session) -> None:  # noqa: ANN001
    _enable(demo, "funding.cpf")
    user, h = make_user(demo, "financement")
    s = find_session(demo, "SST-2026-02")  # en cours
    e = next(x for x in s.enrollments if any(sig.present and sig.signed_at for sig in x.signatures))
    case = service.open_case(demo, e, 500, user)
    cpf = service.add_source(demo, case, "CPF", user)
    demo.commit()
    assert cpf.payer_kind == "FINANCEUR" and cpf.provider_name == "Caisse des Dépôts"

    r = client.post(f"/api/v1/financement/sources/{cpf.id}/actions/accepter", json={}, headers=h)
    assert r.status_code == 409 and "référence du financeur" in r.json()["detail"]
    r = client.post(f"/api/v1/financement/sources/{cpf.id}/actions/accepter",
                    json={"external_ref": "EDOF-2026-0001", "amount_granted": "500"}, headers=h)
    assert r.status_code == 200 and r.json()["etat"] == "ACCEPTEE"
    caps = r.json()["capabilities"]
    assert caps["declarer_entree"]["allowed"] and caps["declarer_entree"]["portail"] == "EDOF"
    assert caps["declarer_entree"]["echeance"] > s.start_date.isoformat()
    assert r.json()["realisation"]["montant_facturable_estime"] is not None

    r = client.post(f"/api/v1/financement/sources/{cpf.id}/actions/declarer_entree", json={}, headers=h)
    assert r.status_code == 200 and r.json()["etat"] == "ENTREE_DECLAREE"
    sortie = r.json()["capabilities"]["declarer_sortie"]
    assert not sortie["allowed"] and "formation terminée" in sortie["message"]
    histo = r.json()["historique"]
    assert [x["action"] for x in histo] == ["accepter", "declarer_entree"] and histo[1]["portail"] == "EDOF"


def test_circuit_opco_jusqu_a_la_facture(demo: Session) -> None:
    _enable(demo, "funding.opco")
    user, _ = make_user(demo, "financement")
    s = find_session(demo, "SSIAP1-2026-01")  # terminée, conventions signées, attestations émises
    chloe = next(x for x in s.enrollments if x.learner.first_name == "Chloé")
    other = next(x for x in s.enrollments if x.status == "TERMINE" and x is not chloe)

    for e, ok in ((chloe, False), (other, True)):
        case = service.open_case(demo, e, 900, user)
        with pytest.raises(Exception, match="financeur"):
            service.add_source(demo, case, "OPCO", user)
        src = service.add_source(demo, case, "OPCO", user, provider_name="Opco EP")
        service.apply(demo, src, "deposer", {}, user)
        service.apply(demo, src, "accorder", {"external_ref": "OEP-42", "amount_granted": 900}, user)
        if not ok:
            with pytest.raises(PolicyDenied, match="demi-journée"):
                service.apply(demo, src, "constater_realisation", {}, user)
            continue
        service.apply(demo, src, "constater_realisation", {}, user)
        service.apply(demo, src, "facturer", {"invoice_ref": "F-2026-0042"}, user)
        view = service.source_view(demo, src, user)
        assert view["etat"] == "FACTUREE" and all(p["etat"] == "OK" for p in view["pieces"]), view["pieces"]
        assert case_status(case)["statut"] == "FUNDED"


def test_reste_a_charge_respecte_le_delai_de_retractation(demo: Session) -> None:
    _enable(demo)
    user, _ = make_user(demo, "financement")
    e = _enrollment(demo, "SSIAP1-2026-03")
    demo.add(t.Agreement(enrollment_id=e.id, kind="CONTRAT", signed_on=TODAY - timedelta(days=3)))
    demo.flush()
    demo.refresh(e)
    case = service.open_case(demo, e, 300, user)
    src = service.add_source(demo, case, "PERSONNEL", user)
    assert src.payer_kind == "STAGIAIRE"
    service.apply(demo, src, "signer", {"amount_granted": 300}, user)
    with pytest.raises(PolicyDenied, match="rétractation de 10 jours"):
        service.apply(demo, src, "enregistrer_paiement", {"amount_paid": 90}, user)
    service.apply(demo, src, "enregistrer_paiement", {"amount_paid": 90}, user, today=TODAY + timedelta(days=8))
    assert src.state == "PAYE"


def test_dispositif_inactif_refuse(demo: Session) -> None:
    _enable(demo, "funding.cpf")
    user, _ = make_user(demo, "financement")
    case = service.open_case(demo, _enrollment(demo, "SST-2026-02"), 500, user)
    with pytest.raises(PolicyDenied) as exc:
        service.add_source(demo, case, "FRANCE_TRAVAIL", user)
    assert exc.value.code == "FEATURE_DISABLED"


def test_regle_datee_et_droits(client, demo: Session) -> None:  # noqa: ANN001
    _enable(demo)
    _, hf = make_user(demo, "financement")
    _, hg = make_user(demo, "gestion")
    _, hl = make_user(demo, "lecture")
    url = "/api/v1/financement/regles/cpf.participation_titulaire_eur"
    assert client.get(url + "?le=2026-03-31", headers=hf).json()["value"] == 100
    r = client.get(url + "?le=2026-04-01", headers=hf).json()
    assert r["value"] == 150 and "2026-234" in r["source"]
    assert client.get("/api/v1/financement/echeances", headers=hg).status_code == 200, "gestion : lecture"
    e = _enrollment(demo, "SST-2026-02")
    assert client.post(f"/api/v1/inscriptions/{e.id}/financement", json={"cout": "500"}, headers=hg).status_code == 403
    assert client.get("/api/v1/financement/echeances", headers=hl).status_code == 403
    assert client.post(f"/api/v1/inscriptions/{e.id}/financement", json={"cout": "500"}, headers=hf).status_code == 201


def test_circuit_france_travail_aif(demo: Session) -> None:
    _enable(demo, "funding.france_travail")
    user, _ = make_user(demo, "financement")
    s = find_session(demo, "SSIAP1-2026-03")  # planifiée dans 30 jours
    e = _enrollment(demo, "SSIAP1-2026-03")
    case = service.open_case(demo, e, 1400, user)
    src = service.add_source(demo, case, "FRANCE_TRAVAIL", user)
    caps = service.source_view(demo, src, user)["capabilities"]
    assert caps["saisir_devis"]["portail"] == "Kairos" and caps["saisir_devis"]["echeance"] < s.start_date.isoformat()
    service.apply(demo, src, "saisir_devis", {}, user)
    service.apply(demo, src, "valider", {"external_ref": "KAIROS-7788", "amount_granted": 1400}, user)
    with pytest.raises(PolicyDenied, match="session démarrée"):
        service.apply(demo, src, "declarer_entree", {}, user)
    assert case_status(case)["statut"] == "FUNDED" and src.provider_name == "France Travail"
