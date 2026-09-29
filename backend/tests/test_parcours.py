"""Parcours du stagiaire : étapes encadrées, refus motivés, documents rédigés par le moteur."""

import hashlib
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.journey import service
from app.platform.decisions import PolicyDenied
from app.platform.settings import ConfigurationService
from app.qualiopi.engine import refresh_all
from app.qualiopi.evidence.models import Evidence
from app.training import models as t
from tests.conftest import TODAY, find_session, make_user


def _learner(db: Session, ref: str, first_name: str) -> t.Enrollment:
    return next(e for e in find_session(db, ref).enrollments if e.learner.first_name == first_name)


def _url(e: t.Enrollment, action: str = "") -> str:
    return f"/api/v1/inscriptions/{e.id}/parcours" + (f"/{action}" if action else "")


def test_convocation_redigee_par_le_moteur(client, demo: Session) -> None:  # noqa: ANN001
    ConfigurationService(demo).set("attendance.weekdays", [1, 2, 3, 4, 5, 6, 7])
    demo.commit()
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")
    paul = _learner(demo, "SST-2026-04", "Paul")

    caps = client.get(_url(paul), headers=h).json()["capabilities"]
    assert caps["convocation"]["code"] == "CONVOCATION_INCOMPLETE", "sans demi-journées, pas d'horaires"
    assert client.post(f"/api/v1/sessions/{s.id}/creneaux", headers=h).json()["crees"] == 4

    r = client.post(_url(paul, "convocation"), headers=h)
    assert r.status_code == 200, r.text
    doc = r.json()["produit"]["document"]
    assert (doc["type"], doc["version"], doc["statut"]) == ("CONVOCATION", 1, "EMIS")
    etape = next(x for x in r.json()["parcours"]["etapes"] if x["etape"] == "convocation")
    assert etape["fait"] and etape["detail"] == "rédigée par le moteur"

    f = client.get(f"{_url(paul).rsplit('/', 1)[0]}/documents/{doc['id']}", headers=h)
    html = f.content.decode()
    assert f.status_code == 200 and hashlib.sha256(f.content).hexdigest() == doc["sha256"] == f.headers["X-Content-SHA256"]
    for expected in ("Convocation", "Paul Lambert", "Sauveteur secouriste du travail", "Site client ACME", "09:00–12:30", "Julie Martin"):
        assert expected in html, expected

    # Réémission : nouvelle version, l'ancienne est remplacée, rien n'est écrasé.
    doc2 = client.post(_url(paul, "convocation"), json={"motif": "Changement de salle"}, headers=h).json()["produit"]["document"]
    assert doc2["version"] == 2
    docs = client.get(_url(paul), headers=h).json()["documents"]
    assert [(d["version"], d["statut"]) for d in docs] == [(1, "REMPLACE"), (2, "EMIS")]

    # Le moteur Qualiopi voit une convocation documentée (I09), sans doublon « document d'organisme ».
    refresh_all(demo, trigger="test", today=TODAY)
    evs = list(demo.scalars(select(Evidence).where(Evidence.enrollment_id == paul.id, Evidence.evidence_type == "CONVOCATION")))
    assert len(evs) == 1 and evs[0].document_id == doc2["id"] and evs[0].status == "EXPLOITABLE"
    assert not demo.scalar(select(Evidence).where(Evidence.source_table == "formation.document", Evidence.source_id == doc2["id"]))


def test_attestation_de_fin_contenu_et_refus_motives(client, demo: Session) -> None:  # noqa: ANN001
    user, h = make_user(demo, "gestion")
    first = next(e for e in find_session(demo, "SSIAP1-2026-01").enrollments
                 if e.status == "TERMINE" and e.learner.first_name not in ("Chloé", "Adam"))
    chloe = _learner(demo, "SSIAP1-2026-01", "Chloé")

    r = client.post(_url(chloe, "attestation"), headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CERTIFICATE_REQUIREMENTS_MISSING"
    assert "1 demi-journée(s) sans présence ni absence notée" in r.json()["detail"]
    assert r.json()["details"][0]["demi_journees"][0].endswith("après-midi")

    r = client.post(_url(first, "attestation"), headers=h)
    assert r.status_code == 200, r.text
    doc = r.json()["produit"]["document"]
    html = client.get(f"/api/v1/inscriptions/{first.id}/documents/{doc['id']}", headers=h).content.decode()
    for expected in ("Attestation de fin de formation", first.learner.full_name, "art. L. 6313-1, 1°",
                     "Intervenir face à un début d&#39;incendie", "10 sur 10", "QCM final", "acquis"):
        assert expected in html, expected

    r = client.post(_url(first, "attestation"), headers=h)
    assert r.status_code == 422 and "motif" in r.json()["detail"]
    r = client.post(_url(first, "attestation"), json={"motif": "Coquille sur le nom"}, headers=h)
    assert r.json()["produit"]["document"]["version"] == 2

    # Session en cours : fin constatée plus tard, puis ce qui manque encore est dit précisément.
    noah = _learner(demo, "SST-2026-02", "Noah")
    with pytest.raises(PolicyDenied, match="se termine le"):
        service.apply(demo, noah, "terminer", {}, user)
    later = find_session(demo, "SST-2026-02").end_date + timedelta(days=1)
    service.apply(demo, noah, "terminer", {}, user, today=later)
    with pytest.raises(PolicyDenied) as exc:
        service.apply(demo, noah, "attestation", {}, user, today=later)
    assert {d["type"] for d in exc.value.details} == {"EMARGEMENT_MANQUANT", "EVALUATION_MANQUANTE"}


def test_statuts_annulation_abandon_confirmation(client, demo: Session) -> None:  # noqa: ANN001
    user, h = make_user(demo, "gestion")
    noah = _learner(demo, "SST-2026-02", "Noah")
    r = client.post(_url(noah, "annuler"), json={"motif": "Erreur"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "ATTENDANCE_RECORDED", "déjà venu : c'est un abandon"
    assert client.post(_url(noah, "abandonner"), json={"date": TODAY.isoformat()}, headers=h).status_code == 422
    r = client.post(_url(noah, "abandonner"), json={"date": TODAY.isoformat(), "motif": "Reprise d'emploi"}, headers=h)
    assert r.status_code == 200 and r.json()["parcours"]["statut"] == "ABANDON"
    assert r.json()["parcours"]["abandon"] == {"le": TODAY.isoformat(), "motif": "Reprise d'emploi"}

    futur = next(e for e in find_session(demo, "SSIAP1-2026-03").enrollments)
    caps = client.get(_url(futur), headers=h).json()["capabilities"]
    assert caps["abandonner"]["code"] == "NOT_STARTED_YET" and caps["annuler"]["allowed"]
    assert caps["annuler"]["a_saisir"] == ["motif"]

    ConfigurationService(demo).set("journey.confirm_requires_agreement", True)
    demo.commit()
    eric = _learner(demo, "SST-2026-04", "Éric")
    assert client.post(_url(eric, "confirmer"), headers=h).json()["error"] == "AGREEMENT_NOT_SIGNED"
    r = client.post(_url(eric, "convention_signer"), json={"date": TODAY.isoformat(), "signataire": "DRH ACME"}, headers=h)
    assert r.status_code == 200, r.text
    assert client.post(_url(eric, "confirmer"), headers=h).json()["parcours"]["statut"] == "CONFIRME"


def test_etapes_avant_formation_et_alertes(demo: Session) -> None:
    user, _ = make_user(demo, "gestion")
    zoe = _learner(demo, "SST-2026-04", "Zoé")
    with pytest.raises(InvalidStateError, match="synthèse"):
        service.apply(demo, zoe, "analyse_besoin", {}, user)
    with pytest.raises(InvalidStateError, match="futur"):
        service.apply(demo, zoe, "analyse_besoin", {"date": (TODAY + timedelta(days=1)).isoformat(), "synthese": "x"}, user)
    service.apply(demo, zoe, "analyse_besoin", {"synthese": "Malvoyante", "adaptation": True,
                                                "adaptation_notes": "Supports en gros caractères"}, user)
    assert zoe.needs_analysis.adaptation_status == "A_TRAITER"
    out = service.apply(demo, zoe, "positionnement", {"methode": "Entretien", "prerequis_ok": False}, user)
    assert "prérequis non atteints" in out["alerte"]
    out = service.apply(demo, zoe, "convention_envoyer", {}, user)
    assert out["convention"]["type"] == "CONTRAT", "sans entreprise : contrat de formation (L. 6353-3)"
    with pytest.raises(PolicyDenied, match="commence le"):
        service.apply(demo, zoe, "evaluation", {"intitule": "QCM"}, user)


def test_formateur_sur_ses_seules_sessions(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    julie_user, hj = make_user(demo, "formateur", email="julie@test.local")
    sst = find_session(demo, "SST-2026-02")
    client.put(f"/api/v1/formateurs/{sst.trainer_id}/compte", json={"user_id": julie_user.id}, headers=ha)
    noah = _learner(demo, "SST-2026-02", "Noah")

    r = client.post(_url(noah, "evaluation"), json={"intitule": "Cas pratique n°1", "nature": "FORMATIVE", "reussi": True}, headers=hj)
    assert r.status_code == 200, r.text
    caps = r.json()["parcours"]["capabilities"]
    assert caps["convocation"]["code"] == "PERMISSION_MISSING" and caps["evaluation"]["allowed"]
    assert client.post(_url(noah, "convocation"), headers=hj).status_code == 409

    chloe = _learner(demo, "SSIAP1-2026-01", "Chloé")
    assert client.get(_url(chloe), headers=hj).status_code == 404, "hors portée : introuvable"
    matrix = client.get(f"/api/v1/sessions/{sst.id}/parcours", headers=hj).json()
    assert {r["stagiaire"] for r in matrix["stagiaires"]} >= {"Noah Clement"}
    assert "evaluation" in next(r for r in matrix["stagiaires"] if r["stagiaire"] == "Noah Clement")["possible"]


def test_satisfaction_a_chaud_et_a_froid(demo: Session) -> None:
    user, _ = make_user(demo, "gestion")
    noah = _learner(demo, "SST-2026-02", "Noah")
    with pytest.raises(PolicyDenied, match="fin de session"):
        service.apply(demo, noah, "satisfaction_chaud", {"note": 4}, user)
    first = next(e for e in find_session(demo, "SSIAP1-2026-01").enrollments if e.status == "TERMINE")
    ConfigurationService(demo).set("journey.cold_survey_min_days", 60)  # session finie il y a 36 jours
    with pytest.raises(PolicyDenied, match="À froid : à partir du"):
        service.apply(demo, first, "satisfaction_froid", {"note": 4}, user)
    with pytest.raises(InvalidStateError, match="entre 0 et 5"):
        service.apply(demo, first, "satisfaction_chaud", {"note": 7}, user)
    out = service.apply(demo, first, "satisfaction_chaud", {"note": "4.5", "commentaire": "Très concret"}, user)
    assert out["satisfaction"] == {"public": "APPRENANT_CHAUD", "note": "4.5"}
