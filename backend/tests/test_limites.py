"""Limites de débit : connexion (adresse, identifiant), pages publiques, émargement ; temps de réponse uniforme."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy.orm import Session

from app.common import limites
from app.handler import attendance, auth, questionnaires
from tests.conftest import make_user

LOGIN = "/api/v1/auth/login"


def _login(client, email: str, password: str = "faux", ip: str | None = None):  # noqa: ANN001, ANN202
    return client.post(LOGIN, json={"email": email, "password": password},
                       headers={"X-Forwarded-For": ip} if ip else {})


def test_limite_fenetre_glissante_et_attente() -> None:
    lim = limites.Limite(2, 60.0)
    assert lim.allow("k", now=0.0) and lim.allow("k", now=1.0)
    assert not lim.allow("k", now=2.0)
    assert lim.attente("k", now=2.0) == pytest.approx(58.0)
    assert lim.attente("k", now=61.5) == 0.0


def test_adresse_du_client() -> None:
    def req(host: str, xff: str | None = None) -> SimpleNamespace:
        return SimpleNamespace(client=SimpleNamespace(host=host), headers={"x-forwarded-for": xff} if xff else {})

    # Derrière le proxy (adresse privée) : la dernière adresse ajoutée par le proxy, pas celle choisie par le client.
    assert limites.client_ip(req("172.18.0.3", "1.2.3.4, 203.0.113.9")) == "203.0.113.9"
    # Connexion directe depuis une adresse publique : l'en-tête est ignoré.
    assert limites.client_ip(req("8.8.8.8", "203.0.113.9")) == "8.8.8.8"
    assert limites.client_ip(req("172.18.0.3")) == "172.18.0.3"


def test_connexion_echecs_par_identifiant(client, db: Session, monkeypatch) -> None:  # noqa: ANN001
    make_user(db, "qualite", "q@test.local")
    monkeypatch.setattr(auth.LOGIN_ECHECS_PAR_COMPTE_ET_ADRESSE, "maximum", 3)
    for _ in range(3):
        assert _login(client, "q@test.local", ip="203.0.113.7").status_code == 401
    # Depuis cette adresse, même le bon mot de passe attend la fin de la fenêtre…
    r = _login(client, "Q@test.local", "mot-de-passe-test", ip="203.0.113.7")
    assert r.status_code == 429
    assert r.json()["detail"] == auth.TROP_DE_TENTATIVES and int(r.headers["retry-after"]) > 0
    # … mais un tiers ne bloque pas l'utilisateur ailleurs, et un autre compte n'est pas concerné.
    assert _login(client, "q@test.local", "mot-de-passe-test", ip="203.0.113.50").status_code == 200
    assert _login(client, "autre@test.local", ip="203.0.113.7").status_code == 401


def test_connexion_attaque_repartie_plafonnee_par_compte(client, db: Session, monkeypatch) -> None:  # noqa: ANN001
    make_user(db, "qualite", "q@test.local")
    monkeypatch.setattr(auth.LOGIN_ECHECS_PAR_COMPTE, "maximum", 4)
    for i in range(4):
        assert _login(client, "q@test.local", ip=f"203.0.113.{i}").status_code == 401
    assert _login(client, "q@test.local", "mot-de-passe-test", ip="203.0.113.99").status_code == 429


def test_connexion_reussie_efface_les_echecs(client, db: Session, monkeypatch) -> None:  # noqa: ANN001
    make_user(db, "qualite", "q@test.local")
    monkeypatch.setattr(auth.LOGIN_ECHECS_PAR_COMPTE, "maximum", 2)
    assert _login(client, "q@test.local").status_code == 401
    assert _login(client, "q@test.local", "mot-de-passe-test").status_code == 200
    assert _login(client, "q@test.local").status_code == 401
    assert _login(client, "q@test.local", "mot-de-passe-test").status_code == 200


def test_connexion_par_adresse(client, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(auth.LOGIN_PAR_ADRESSE, "maximum", 3)
    for i in range(3):
        assert _login(client, f"x{i}@test.local", ip="203.0.113.7").status_code == 401
    assert _login(client, "y@test.local", ip="203.0.113.7").status_code == 429
    assert _login(client, "y@test.local", ip="203.0.113.8").status_code == 401


def test_email_inconnu_calcule_quand_meme_bcrypt(client, db: Session, monkeypatch) -> None:  # noqa: ANN001
    user, _ = make_user(db, "qualite", "q@test.local")
    user.is_active = False
    db.commit()
    calls: list[str] = []
    real = auth.verify_password

    def spy(password: str, hashed: str) -> bool:
        calls.append(hashed)
        return real(password, hashed)

    monkeypatch.setattr(auth, "verify_password", spy)
    assert _login(client, "inconnu@test.local").status_code == 401
    assert _login(client, "q@test.local", "mot-de-passe-test").status_code == 401  # compte inactif
    assert len(calls) == 2 and calls[0] == auth._EMPREINTE_FACTICE


def test_pages_publiques_limitees(client, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(questionnaires.PUBLIC_PAR_ADRESSE, "maximum", 2)
    for _ in range(2):
        assert client.get("/api/v1/public/questionnaires/x.y").status_code != 429
    r = client.get("/api/v1/public/documents/x.y")
    assert r.status_code == 429 and "réessayez" in r.json()["detail"]


def test_signature_emargement_limitee(client, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(attendance.SIGNATURE_PAR_ADRESSE, "maximum", 2)
    for _ in range(2):
        assert client.post("/api/v1/emargement/signer", json={"code": "x", "jeton": "y"}).status_code != 429
    r = client.post("/api/v1/emargement/signer", json={"code": "x", "jeton": "y"})
    assert r.status_code == 429 and "réessayez" in r.json()["detail"]
