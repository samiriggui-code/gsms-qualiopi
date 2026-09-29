from sqlalchemy.orm import Session

from tests.conftest import make_user


def test_health(client) -> None:  # noqa: ANN001
    assert client.get("/health").json() == {"status": "ok"}


def test_login_et_me(client, db: Session) -> None:  # noqa: ANN001
    make_user(db, "qualite", "q@test.local")
    bad = client.post("/api/v1/auth/login", json={"email": "q@test.local", "password": "faux"})
    assert bad.status_code == 401
    ok = client.post("/api/v1/auth/login", json={"email": "Q@test.local ", "password": "mot-de-passe-test"})
    assert ok.status_code == 200
    token = ok.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["roles"] == ["qualite"] and "evidence.validate" in me.json()["permissions"]


def test_sans_jeton_401(client) -> None:  # noqa: ANN001
    assert client.get("/api/v1/qualiopi/readiness").status_code == 401
    assert client.get("/api/v1/qualiopi/readiness", headers={"Authorization": "Bearer faux"}).status_code == 401


def test_permissions_par_role(client, db: Session) -> None:  # noqa: ANN001
    _, lecture = make_user(db, "lecture")
    _, gestion = make_user(db, "gestion")
    assert client.post("/api/v1/qualiopi/evaluate", headers=lecture).status_code == 403
    assert client.post("/api/v1/referentials/import", json={}, headers=gestion).status_code == 403


def test_import_referentiel_par_api(client, db: Session) -> None:  # noqa: ANN001
    _, qualite = make_user(db, "qualite")
    r = client.post("/api/v1/referentials/import", json={"folder": "qualiopi/v9"}, headers=qualite)
    assert r.status_code == 200, r.text
    assert r.json()["indicators"] == 32
    assert client.get("/api/v1/referentials/active", headers=qualite).json()["version"] == "V9"


def test_import_hors_dossier_referentiels_refuse(client, db: Session) -> None:  # noqa: ANN001
    _, qualite = make_user(db, "qualite")
    r = client.post("/api/v1/referentials/import", json={"folder": "../../app"}, headers=qualite)
    assert r.status_code == 404


def test_aucun_referentiel_actif(client, db: Session) -> None:  # noqa: ANN001
    _, lecture = make_user(db, "lecture")
    r = client.get("/api/v1/qualiopi/readiness", headers=lecture)
    assert r.status_code == 400
    assert "Aucun référentiel actif" in r.json()["detail"]
