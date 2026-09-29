"""RH : formateur limité à ses sessions, personnel, contrats, absences, titres, disponibilité."""

from datetime import timedelta

from sqlalchemy.orm import Session

from tests.conftest import TODAY, find_session, make_user


def _link(client, admin_headers, session, user_id: str) -> None:  # noqa: ANN001
    r = client.put(f"/api/v1/formateurs/{session.trainer_id}/compte", json={"user_id": user_id}, headers=admin_headers)
    assert r.status_code == 200, r.text


def test_le_formateur_ne_voit_que_ses_sessions(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    karim_user, hk = make_user(demo, "formateur", email="karim@test.local")
    ssiap = find_session(demo, "SSIAP1-2026-01")
    sst = find_session(demo, "SST-2026-02")
    assert ssiap.trainer_id != sst.trainer_id

    assert client.get("/api/v1/sessions", headers=hk).json() == [], "compte non relié : aucune session"
    _link(client, ha, ssiap, karim_user.id)
    refs = {s["reference"] for s in client.get("/api/v1/sessions", headers=hk).json()}
    assert "SSIAP1-2026-01" in refs and "SST-2026-02" not in refs
    assert client.get(f"/api/v1/sessions/{ssiap.id}", headers=hk).status_code == 200
    assert client.get(f"/api/v1/sessions/{sst.id}", headers=hk).status_code == 404, "hors portée : introuvable"
    assert client.get(f"/api/v1/sessions/{sst.id}/emargement", headers=hk).status_code == 404
    assert client.get("/api/v1/stagiaires", headers=hk).status_code == 403, "pas l'annuaire complet des stagiaires"
    nav = [n["key"] for n in client.get("/api/v1/bootstrap", headers=hk).json()["navigation"]]
    assert "mes_sessions" in nav and "sessions" not in nav


def test_liaison_de_compte_reservee_et_unique(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    _, hg = make_user(demo, "gestion")
    user, _ = make_user(demo, "formateur", email="double@test.local")
    ssiap, sst = find_session(demo, "SSIAP1-2026-01"), find_session(demo, "SST-2026-02")
    url = f"/api/v1/formateurs/{ssiap.trainer_id}/compte"
    assert client.put(url, json={"user_id": user.id}, headers=hg).status_code == 403, "users.manage requis"
    _link(client, ha, ssiap, user.id)
    r = client.put(f"/api/v1/formateurs/{sst.trainer_id}/compte", json={"user_id": user.id}, headers=ha)
    assert r.status_code == 409


def test_l_admin_nomme_un_admin_meme_module_rh_inactif(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    other, _ = make_user(demo, "lecture", email="futur-admin@test.local")
    r = client.put(f"/api/v1/auth/users/{other.id}/roles", json={"roles": ["admin"]}, headers=ha)
    assert r.status_code == 200


def test_absence_et_contrat_verifies_a_la_confirmation(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    _, hr = make_user(demo, "rh")
    _, hg = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")  # planifiée, formateur et lieu renseignés
    assert client.get("/api/v1/rh/personnel", headers=hr).status_code == 403, "module RH inactif par défaut"
    assert client.put("/api/v1/features/hr", json={"enabled": True}, headers=ha).status_code == 200

    r = client.post("/api/v1/rh/personnel", headers=hr, json={
        "first_name": "Julie", "last_name": "Martin", "kind": "SALARIE", "trainer_id": s.trainer_id})
    assert r.status_code == 201, r.text
    staff_id = r.json()["id"]
    r = client.post(f"/api/v1/rh/personnel/{staff_id}/absences", headers=hr, json={
        "start_date": s.start_date.isoformat(), "end_date": s.start_date.isoformat(), "kind": "CONGE"})
    assert r.status_code == 201
    caps = client.get(f"/api/v1/sessions/{s.id}/capabilities", headers=hg).json()
    assert caps["confirm"]["code"] == "TRAINER_UNAVAILABLE" and caps["confirm"]["details"][0]["nature"] == "CONGE"

    # Un autre membre, contrat terminé avant la session.
    s3 = find_session(demo, "SSIAP1-2026-03")
    r = client.post("/api/v1/rh/personnel", headers=hr, json={
        "first_name": "Karim", "last_name": "Benali", "kind": "INDEPENDANT", "trainer_id": s3.trainer_id})
    karim = r.json()["id"]
    client.post(f"/api/v1/rh/personnel/{karim}/contrats", headers=hr, json={
        "kind": "PRESTATION", "start_date": (TODAY - timedelta(days=90)).isoformat(),
        "end_date": (s3.start_date - timedelta(days=1)).isoformat()})
    assert client.get(f"/api/v1/sessions/{s3.id}/capabilities", headers=hg).json()["confirm"]["code"] == "TRAINER_NO_CONTRACT"
    client.post(f"/api/v1/rh/personnel/{karim}/contrats", headers=hr, json={
        "kind": "PRESTATION", "start_date": s3.start_date.isoformat(), "end_date": s3.end_date.isoformat()})
    assert client.get(f"/api/v1/sessions/{s3.id}/capabilities", headers=hg).json()["confirm"] == {"allowed": True}


def test_echeances_des_titres_des_formateurs(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    _, hr = make_user(demo, "rh")
    client.put("/api/v1/features/hr", json={"enabled": True}, headers=ha)
    trainer_id = find_session(demo, "SST-2026-04").trainer_id
    r = client.post(f"/api/v1/formateurs/{trainer_id}/titres", headers=hr, json={
        "kind": "CARTE_PRO_FORMATEUR_CNAPS", "label": "Carte formateur CNAPS", "number": "FOR-075-2031-01-01-X",
        "valid_until": (TODAY + timedelta(days=30)).isoformat()})
    assert r.status_code == 201
    assert client.post(f"/api/v1/formateurs/{trainer_id}/titres", headers=hr,
                       json={"kind": "PERMIS_POIDS_LOURD", "label": "X"}).status_code == 422
    rows = client.get("/api/v1/rh/echeances?jours=60", headers=hr).json()
    carte = next(x for x in rows if x["type"] == "CARTE_PRO_FORMATEUR_CNAPS")
    assert carte["etat"] == "A_RENOUVELER"
