"""Écrans Preuves, Évaluations et Audits : lectures, décisions motivées et parcours complet par l'API."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.qualiopi.evaluation.models import Finding
from app.qualiopi.evidence.models import Evidence
from tests.conftest import TODAY, make_user

API = "/api/v1/qualiopi"


def test_liste_et_fiche_des_preuves(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "qualite")
    data = client.get(f"{API}/preuves", headers=h).json()
    assert data["total"] == len(data["preuves"]) > 0
    assert {s["statut"] for s in data["par_statut"]} >= {"EXPLOITABLE", "VALIDEE", "REJETEE"}
    row = data["preuves"][0]
    assert row["type_libelle"] and row["statut_libelle"] and row["cible"]
    assert set(row["capabilities"]) == {"valider", "rejeter"}

    analyses = client.get(f"{API}/preuves", params={"type": "NEEDS_ANALYSIS"}, headers=h).json()["preuves"]
    assert analyses and all(p["type"] == "NEEDS_ANALYSIS" and 4 in p["indicateurs"] for p in analyses)
    i04 = client.get(f"{API}/preuves", params={"indicateur": 4}, headers=h).json()["preuves"]
    assert i04 and all(4 in p["indicateurs"] for p in i04)
    ex = client.get(f"{API}/preuves", params={"statut": "EXPLOITABLE"}, headers=h).json()["preuves"]
    assert ex and {p["statut"] for p in ex} == {"EXPLOITABLE"}
    found = client.get(f"{API}/preuves", params={"recherche": analyses[0]["reference"]}, headers=h).json()["preuves"]
    assert [p["id"] for p in found] == [analyses[0]["id"]]

    fiche = client.get(f"{API}/preuves/{analyses[0]['id']}", headers=h).json()
    assert fiche["liens"] and fiche["historique"][0]["libelle"]
    assert client.get(f"{API}/preuves/inconnue", headers=h).status_code == 404


def test_validation_d_une_preuve_selon_la_decision_de_l_api(client, demo: Session) -> None:  # noqa: ANN001
    _, hl = make_user(demo, "lecture")
    _, hq = make_user(demo, "qualite")
    ev = demo.scalar(select(Evidence).where(Evidence.status == "EXPLOITABLE", Evidence.source_table != "formation.document"))
    lecture = client.get(f"{API}/preuves/{ev.id}", headers=hl).json()
    assert lecture["capabilities"]["valider"]["code"] == "PERMISSION_MISSING"

    fiche = client.get(f"{API}/preuves/{ev.id}", headers=hq).json()
    assert fiche["capabilities"]["valider"]["allowed"] and fiche["grille"] == []
    r = client.post(f"/api/v1/evidence/{ev.id}/validation", json={"decision": "VALIDEE"}, headers=hq)
    assert r.status_code == 200, r.text
    fiche = client.get(f"{API}/preuves/{ev.id}", headers=hq).json()
    assert fiche["statut"] == "VALIDEE" and fiche["decisions"][0]["decision"] == "VALIDEE"
    assert fiche["capabilities"]["valider"]["code"] == "ALREADY_VALIDATED"
    assert fiche["capabilities"]["rejeter"]["allowed"]
    assert fiche["historique"][0]["libelle"] == "Validée"


def test_evaluations_resultats_et_constats(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "qualite")
    data = client.get(f"{API}/evaluations", headers=h).json()
    assert data["derniere"] and data["derniere"]["resultats"] > 0
    assert len(data["indicateurs"]) == 32 and data["capabilities"]["reevaluer"]["allowed"]
    i04 = next(i for i in data["indicateurs"] if i["numero"] == 4)
    assert i04["etat"] == "PREUVES_INSUFFISANTES" and i04["controles"] > 0 and i04["ecarts_ouverts"] >= 1

    res = client.get(f"{API}/evaluations/resultats", params={"indicateur": 4}, headers=h).json()["resultats"]
    assert res and res[0]["etat"] == "PREUVES_INSUFFISANTES", "le pire d'abord"
    assert res[0]["libelle"] != res[0]["controle"] and res[0]["cible"]
    ko = client.get(f"{API}/evaluations/resultats", params={"etat": "PREUVES_INSUFFISANTES"}, headers=h).json()
    assert ko["total"] > 0 and {r["etat"] for r in ko["resultats"]} == {"PREUVES_INSUFFISANTES"}

    constats = client.get(f"{API}/constats", headers=h).json()
    assert constats and constats[0]["statut_libelle"]
    _, hl = make_user(demo, "lecture")
    assert client.get(f"{API}/evaluations", headers=hl).json()["capabilities"]["reevaluer"]["code"] == "PERMISSION_MISSING"


def test_audit_interne_de_bout_en_bout(client, demo: Session) -> None:  # noqa: ANN001
    _, hq = make_user(demo, "qualite")
    _, hl = make_user(demo, "lecture")
    sample = client.get(f"{API}/audits/echantillon", headers=hq).json()
    proposees = {s["reference"] for s in sample["sessions"] if s["proposee"]}
    assert proposees == {"SSIAP1-2026-01", "SST-2026-02"}

    assert client.get(f"{API}/audits", headers=hl).json()["capabilities"]["creer"]["code"] == "PERMISSION_MISSING"
    body = {"titre": "Audit blanc d'octobre", "type": "BLANC", "auditeur": "Eve Martin", "prevu_le": TODAY.isoformat()}
    assert client.post(f"{API}/audits", json=body, headers=hl).status_code == 409
    r = client.post(f"{API}/audits", json=body, headers=hq)
    assert r.status_code == 201, r.text
    audit = r.json()
    assert len(audit["indicateurs"]) == 32 and audit["progression"] == {"juges": 0, "total": 32}
    assert sorted(audit["echantillon"]) == sorted(proposees)
    assert audit["capabilities"]["clore"]["code"] == "JUDGMENTS_MISSING"
    assert "Conforme" not in str(audit), "jamais « conforme » dans ce que l'écran affiche"
    url = f"{API}/audits/{audit['id']}"

    r = client.post(f"{url}/indicateurs/26", json={"jugement": "NC_MINEURE"}, headers=hq)
    assert r.status_code == 422 and "motivée" in r.json()["detail"]
    for n in range(1, 33):
        jugement = {"jugement": "NC_MINEURE", "commentaire": "Référent absent des supports"} if n == 26 else {"jugement": "CONFORME"}
        assert client.post(f"{url}/indicateurs/{n}", json=jugement, headers=hq).status_code == 200
    audit = client.get(url, headers=hq).json()
    assert audit["capabilities"]["clore"]["allowed"]
    assert next(i for i in audit["indicateurs"] if i["numero"] == 1)["jugement_libelle"] == "Satisfait"

    r = client.post(f"{url}/cloture", json={"conclusion": "Une non-conformité mineure."}, headers=hq)
    assert r.status_code == 200, r.text
    audit = r.json()
    assert audit["statut"] == "CLOS" and audit["capabilities"]["juger"]["code"] == "AUDIT_CLOSED"
    i26 = next(i for i in audit["indicateurs"] if i["numero"] == 26)
    f = demo.scalar(select(Finding).where(Finding.origin == "AUDIT"))
    assert i26["constat"] == f.reference

    comparaison = client.get(f"{API}/audits/comparaison", headers=hq).json()
    assert [a["reference"] for a in comparaison["audits"]] == [audit["reference"]]
    assert len(comparaison["indicateurs"]) == 32
