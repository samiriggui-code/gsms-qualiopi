"""Passerelle vers le moteur IA : une seule connexion, compte de service créé au premier appel."""

from app.application.service.ia import session as ia
from app.config.config import get_settings
from tests.conftest import make_user


def configure(monkeypatch, url="http://ia-app:8080"):  # noqa: ANN001, ANN201
    s = get_settings()
    monkeypatch.setattr(s, "weknora_url", url)
    monkeypatch.setattr(s, "weknora_service_email", "service@gsms.local")
    monkeypatch.setattr(s, "weknora_service_password", "mot-de-passe-de-service")


def fake_engine(monkeypatch):  # noqa: ANN001, ANN201
    """Moteur simulé : refuse la connexion tant que le compte n'est pas inscrit."""
    state = {"registered": False, "calls": []}

    def post(path, payload):  # noqa: ANN001, ANN202
        state["calls"].append(path)
        if path == "/api/v1/auth/register":
            state["registered"] = True
            return 200, {"success": True}
        if state["registered"]:
            return 200, {"success": True, "token": "jeton-weknora", "user": {"id": "u1"}, "tenant": {"id": 1}}
        return 401, {"success": False}

    monkeypatch.setattr(ia, "_post", post)
    return state


def test_session_ia_inscrit_le_compte_de_service_au_premier_appel(client, db, monkeypatch):
    _, headers = make_user(db, "admin")
    configure(monkeypatch)
    state = fake_engine(monkeypatch)

    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 200
    assert r.json()["token"] == "jeton-weknora"
    assert state["calls"] == ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/login"]

    # Appels suivants : simple connexion.
    state["calls"].clear()
    assert client.post("/api/v1/ia/session", headers=headers).status_code == 200
    assert state["calls"] == ["/api/v1/auth/login"]


def test_session_ia_non_configuree(client, db, monkeypatch):
    _, headers = make_user(db, "admin")
    configure(monkeypatch, url="")
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 503


def test_session_ia_reservee_aux_comptes_connectes(client, monkeypatch):
    configure(monkeypatch)
    fake_engine(monkeypatch)
    assert client.post("/api/v1/ia/session").status_code == 401
