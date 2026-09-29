"""Chaîne d'un indicateur (critère → exigences → preuves → écarts → actions → historique) et actions correctives par l'API."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.qualiopi.engine import process_pending
from app.qualiopi.evaluation.models import Finding
from app.training import models as t
from tests.conftest import TODAY, make_user


def test_criteres_et_indicateurs(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "qualite")
    criteres = client.get("/api/v1/qualiopi/criteres", headers=h).json()
    assert len(criteres) == 7 and sum(len(c["indicateurs"]) for c in criteres) == 32
    i04 = next(i for c in criteres for i in c["indicateurs"] if i["numero"] == 4)
    assert i04["etat"] == "PREUVES_INSUFFISANTES" and i04["ecarts_ouverts"] >= 1


def test_chaine_de_l_indicateur_4(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "qualite")
    c = client.get("/api/v1/qualiopi/indicateurs/4", headers=h).json()
    assert c["critere"]["numero"] == 2 and c["critere"]["titre"]
    assert c["indicateur"]["code"] == "I04" and "Énoncé" in [x["section"] for x in c["indicateur"]["exigences"]]
    attendue = c["preuves_attendues"][0]
    assert (attendue["type"], attendue["libelle"]) == ("NEEDS_ANALYSIS", "Analyse du besoin") and attendue["disponibles"] > 0
    resultats = c["controles"][0]["resultats"]
    assert resultats[0]["etat"] == "PREUVES_INSUFFISANTES", "le pire d'abord"
    sst = next(r for r in resultats if r["cible"] == "SST-2026-02")
    assert any(m.get("who") == "Louis Morin" for m in sst["manquants"])
    ecart = next(e for e in c["ecarts"] if e["cible"] == "SST-2026-02")
    assert ecart["statut"] == "OUVERT" and ecart["capabilities"]["ouvrir_action"]["allowed"]
    assert c["preuves"]["total"] > 0 and c["preuves"]["liste"][0]["type_libelle"] == "Analyse du besoin"
    assert any(h["type"] == "ECART_CONSTATE" for h in c["historique"])

    _, hl = make_user(demo, "lecture")
    lecture = client.get("/api/v1/qualiopi/indicateurs/4", headers=hl).json()
    assert lecture["ecarts"][0]["capabilities"]["ouvrir_action"]["code"] == "PERMISSION_MISSING"
    assert client.get("/api/v1/qualiopi/indicateurs/99", headers=h).status_code == 404


def test_action_corrective_de_bout_en_bout(client, demo: Session) -> None:  # noqa: ANN001
    _, hq = make_user(demo, "qualite")
    _, ha = make_user(demo, "assistant_qualite")
    f = demo.scalar(select(Finding).where(Finding.control_key == "I26.disability-referent"))
    url = f"/api/v1/qualiopi/ecarts/{f.id}/actions"
    body = {"titre": "Compléter le référent handicap", "plan": "Ajouter son e-mail sur la fiche organisme",
            "responsable": "Direction", "echeance": (TODAY - timedelta(days=1)).isoformat()}
    assert client.post(url, json=body, headers=hq).status_code == 422, "échéance passée refusée"
    body["echeance"] = (TODAY + timedelta(days=15)).isoformat()
    r = client.post(url, json=body, headers=hq)
    assert r.status_code == 201, r.text
    action = r.json()
    assert action["statut"] == "OUVERTE" and action["ecart"]["indicateur"] == 26
    assert action["capabilities"]["realiser"]["a_saisir"] == ["note"]
    a_url = f"/api/v1/qualiopi/actions/{action['id']}"

    r = client.post(f"{a_url}/realiser", json={"note": "E-mail ajouté"}, headers=ha)
    assert r.status_code == 200 and r.json()["statut"] == "A_VERIFIER"
    assert r.json()["capabilities"]["verifier"]["code"] == "PERMISSION_MISSING", "l'assistant ne vérifie pas l'efficacité"
    r = client.post(f"{a_url}/verifier", json={}, headers=ha)
    assert r.status_code == 409 and r.json()["error"] == "PERMISSION_MISSING"

    # Rien n'est corrigé : le moteur fait échouer la vérification.
    r = client.post(f"{a_url}/verifier", json={}, headers=hq)
    assert r.json()["capabilities"]["verifier"]["code"] == "VERIFICATION_PENDING"
    demo.expire_all()
    process_pending(demo, today=TODAY)
    demo.commit()
    assert client.get(a_url, headers=hq).json()["statut"] == "EN_COURS"

    demo.scalar(select(t.Organization)).disability_referent_email = "referent.handicap@exemple.fr"
    demo.commit()
    client.post(f"{a_url}/realiser", json={"note": "E-mail réellement ajouté"}, headers=hq)
    client.post(f"{a_url}/verifier", json={}, headers=hq)
    demo.expire_all()
    process_pending(demo, today=TODAY)
    demo.commit()
    final = client.get(a_url, headers=hq).json()
    assert final["statut"] == "CLOTUREE" and final["verification"].startswith("Efficace")
    assert all(not d["allowed"] for d in final["capabilities"].values())

    chaine = client.get("/api/v1/qualiopi/indicateurs/26", headers=hq).json()
    libelles = [x["libelle"] for x in chaine["historique"]]
    assert any("clôturée" in x for x in libelles) and any("résolu" in x for x in libelles)
    en_retard = client.get("/api/v1/qualiopi/actions?en_retard=true", headers=hq).json()
    assert all(a["en_retard"] for a in en_retard)
