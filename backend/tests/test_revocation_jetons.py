"""Révocation des jetons de connexion : version de jeton par compte (constat d'audit F2).

Un jeton porte la version du compte au moment de la connexion ; elle s'incrémente au changement de mot de passe,
à la désactivation du compte et à la « déconnexion partout » : tous les jetons émis avant cessent d'être acceptés.
"""

import jwt
from sqlalchemy.orm import Session

from app.config.config import get_settings
from app.middleware.auth import create_token
from tests.conftest import make_user

ME = "/api/v1/auth/me"


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(client, email: str, password: str = "mot-de-passe-test") -> str:  # noqa: ANN001
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_le_jeton_porte_la_version_et_la_date_d_emission(client, db: Session) -> None:  # noqa: ANN001
    user, _ = make_user(db, "gestion", email="ver@test.local")
    payload = jwt.decode(login(client, "ver@test.local"), get_settings().jwt_secret, algorithms=["HS256"])
    assert payload["sub"] == user.id and payload["ver"] == 0 and "iat" in payload


def test_jeton_sans_version_ou_perime_refuse(client, db: Session) -> None:  # noqa: ANN001
    user, h = make_user(db, "gestion", email="ancien@test.local")
    assert client.get(ME, headers=h).status_code == 200
    ancien = jwt.encode({"sub": user.id, "exp": 4102444800}, get_settings().jwt_secret, algorithm="HS256")
    r = client.get(ME, headers=bearer(ancien))
    assert r.status_code == 401 and "révoquée" in r.json()["detail"]


def test_changer_son_mot_de_passe_revoque_les_autres_jetons(client, db: Session) -> None:  # noqa: ANN001
    make_user(db, "gestion", email="mdp@test.local")
    telephone, ordinateur = login(client, "mdp@test.local"), login(client, "mdp@test.local")
    r = client.post("/api/v1/auth/me/password", json={"actuel": "mot-de-passe-test", "nouveau": "nouveau-mot-de-passe"},
                    headers=bearer(ordinateur))
    assert r.status_code == 200
    neuf = r.json()["access_token"]
    assert client.get(ME, headers=bearer(telephone)).status_code == 401
    assert client.get(ME, headers=bearer(ordinateur)).status_code == 401
    assert client.get(ME, headers=bearer(neuf)).status_code == 200  # la session courante continue avec le jeton rendu


def test_deconnexion_partout(client, db: Session) -> None:  # noqa: ANN001
    make_user(db, "lecture", email="partout@test.local")
    a, b = login(client, "partout@test.local"), login(client, "partout@test.local")
    assert client.post("/api/v1/auth/me/deconnexion-partout", headers=bearer(a)).status_code == 204
    assert client.get(ME, headers=bearer(a)).status_code == 401
    assert client.get(ME, headers=bearer(b)).status_code == 401
    assert client.get(ME, headers=bearer(login(client, "partout@test.local"))).status_code == 200


def test_desactivation_revoque_meme_apres_reactivation(client, db: Session) -> None:  # noqa: ANN001
    _, admin = make_user(db, "admin", email="chef@test.local")
    cible, _ = make_user(db, "lecture", email="cible@test.local")
    jeton = login(client, "cible@test.local")
    url = f"/api/v1/auth/users/{cible.id}/active"
    assert client.put(url, json={"is_active": False}, headers=admin).status_code == 200
    assert client.put(url, json={"is_active": True}, headers=admin).status_code == 200
    assert client.get(ME, headers=bearer(jeton)).status_code == 401
    assert client.get(ME, headers=bearer(login(client, "cible@test.local"))).status_code == 200


def test_changement_de_roles_ne_deconnecte_pas_mais_s_applique_aussitot(client, db: Session) -> None:  # noqa: ANN001
    """Les droits sont relus en base à chaque requête : retirer un rôle s'applique sans révoquer le jeton."""
    _, admin = make_user(db, "admin", email="chef@test.local")
    cible, h = make_user(db, "gestion", email="roles@test.local")
    assert client.get("/api/v1/stagiaires", headers=h).status_code == 200
    r = client.put(f"/api/v1/auth/users/{cible.id}/roles", json={"roles": ["rh"]}, headers=admin)
    assert r.status_code == 200
    assert client.get(ME, headers=h).status_code == 200
    assert client.get("/api/v1/stagiaires", headers=h).status_code == 403


def test_create_token_suit_la_version_courante(db: Session) -> None:
    user, _ = make_user(db, "lecture", email="suivi@test.local")
    user.token_version = 3
    db.commit()
    payload = jwt.decode(create_token(user), get_settings().jwt_secret, algorithms=["HS256"])
    assert payload["ver"] == 3
