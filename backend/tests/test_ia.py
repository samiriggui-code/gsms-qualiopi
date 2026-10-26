"""Passerelle vers le moteur IA : une seule connexion, compte de service côté serveur, compte navigateur remis au front."""

from app.application.service.ia import espace
from app.application.service.ia import session as ia
from app.config.config import get_settings
from tests.conftest import make_user

SERVICE, BROWSER = "service@gsms.local", "service+navigateur@gsms.local"


def configure(monkeypatch, url="http://ia-app:8080"):  # noqa: ANN001, ANN201
    s = get_settings()
    monkeypatch.setattr(s, "weknora_url", url)
    monkeypatch.setattr(s, "weknora_service_email", SERVICE)
    monkeypatch.setattr(s, "weknora_service_password", "mot-de-passe-de-service")
    monkeypatch.setattr(s, "weknora_browser_email", "")


def fake_engine(monkeypatch, registration_open: bool = True):  # noqa: ANN001, ANN201
    """Moteur simulé : comptes inscrits au premier appel, espace de l'organisme = 1, espace personnel = 2."""
    state = {"accounts": {}, "members": {SERVICE: "owner"}, "calls": [], "open": registration_open}
    tokens = {SERVICE: "jeton-weknora", BROWSER: "jeton-navigateur"}

    def login_body(email: str) -> dict:
        tenant = state["accounts"][email]["tenant"]
        token = tokens[email] + ("" if email == SERVICE or tenant == 2 else "-espace")
        return {"success": True, "token": token, "refresh_token": "rt-7-jours", "user": {"email": email},
                "active_tenant": {"id": tenant}, "memberships": [{"tenant_id": tenant}]}

    def post(path, payload, token=None):  # noqa: ANN001, ANN202
        state["calls"].append(path)
        if path == "/api/v1/auth/register":
            if not state["open"]:
                return 403, {"success": False, "error": {"message": "Public registration is disabled"}}
            assert payload["email"] != BROWSER or (len(payload["password"]) <= 32 and "!" in payload["password"])
            state["accounts"][payload["email"]] = {"password": payload["password"],
                                                   "tenant": 1 if payload["email"] == SERVICE else 2}
            return 201, {"success": True}
        if path == "/api/v1/auth/login":
            account = state["accounts"].get(payload["email"])
            if account and account["password"] == payload["password"]:
                return 200, login_body(payload["email"])
            return 401, {"success": False}
        if path == "/api/v1/tenants/1/members":
            assert token == "jeton-weknora" and payload == {"email": BROWSER, "role": "contributor"}
            state["members"][BROWSER] = "contributor"
            return 200, {"success": True}
        if path == "/api/v1/auth/switch-tenant":
            assert token == "jeton-navigateur" and state["members"].get(BROWSER) and payload == {"tenant_id": 1}
            state["accounts"][BROWSER]["tenant"] = 1
            return 200, login_body(BROWSER)
        raise AssertionError(f"appel inattendu {path}")

    def call(method, path, payload=None, token=None, timeout=30):  # noqa: ANN001, ANN202, ARG001
        state["calls"].append(path.split("?")[0])
        assert method == "GET" and path.startswith("/api/v1/tenants/current/members") and token == "jeton-weknora"
        return 200, {"success": True, "data": {"members": [{"email": e, "role": r} for e, r in state["members"].items()]}}

    monkeypatch.setattr(ia, "_post", post)
    monkeypatch.setattr(ia, "call", call)
    # Déclaration MCP sans objet ici (voir test_ia_espace.py) : l'espace simulé n'a aucun service.
    if not getattr(espace.call, "is_workspace", False):
        monkeypatch.setattr(espace, "call", lambda *a, **k: (200, {"success": True, "data": []}) if a[0] == "GET"
                            else (200, {"success": True, "data": {"id": "svc"}}))
    return state


def test_session_ia_compte_navigateur_contributeur_sans_jeton_de_renouvellement(client, db, monkeypatch):
    _, headers = make_user(db, "admin")
    configure(monkeypatch)
    state = fake_engine(monkeypatch)

    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 200
    body = r.json()
    # Le navigateur reçoit le compte contributeur, dans l'espace de l'organisme, jamais le compte de service.
    assert body["token"] == "jeton-navigateur-espace"
    assert body["active_tenant"]["id"] == 1 and body["user"]["email"] == BROWSER
    assert "jeton-weknora" not in r.text
    assert "refresh_token" not in body and "rt-7-jours" not in r.text
    assert state["members"][BROWSER] == "contributor"
    assert state["calls"][:3] == ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/login"]

    # Appels suivants (renouvellement) : simples connexions, WeKnora a retenu l'espace de l'organisme.
    state["calls"].clear()
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.json()["token"] == "jeton-navigateur-espace" and "refresh_token" not in r.json()
    assert state["calls"] == ["/api/v1/auth/login", "/api/v1/auth/login"]


def test_session_ia_reservee_a_la_permission_ia_use(client, db, monkeypatch):
    configure(monkeypatch)
    fake_engine(monkeypatch)
    for role in ("formateur", "rh", "financement", "assistant_ia"):
        _, headers = make_user(db, role, email=f"{role}@test.local")
        r = client.post("/api/v1/ia/session", headers=headers)
        assert r.status_code == 403, role
        assert "ia.use" in r.json()["detail"]
    for role in ("qualite", "assistant_qualite", "gestion", "lecture"):
        _, headers = make_user(db, role, email=f"{role}@test.local")
        assert client.post("/api/v1/ia/session", headers=headers).status_code == 200, role


def test_session_ia_coupee_quand_le_compte_gsms_est_desactive(client, db, monkeypatch):
    user, headers = make_user(db, "gestion")
    configure(monkeypatch)
    fake_engine(monkeypatch)
    assert client.post("/api/v1/ia/session", headers=headers).status_code == 200
    user.is_active = False
    db.commit()
    assert client.post("/api/v1/ia/session", headers=headers).status_code == 401


def test_inscription_fermee_explique_la_premiere_installation(client, db, monkeypatch):
    _, headers = make_user(db, "admin")
    configure(monkeypatch)
    fake_engine(monkeypatch, registration_open=False)
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 503 and "DISABLE_REGISTRATION" in r.json()["detail"]


def test_session_ia_non_configuree(client, db, monkeypatch):
    _, headers = make_user(db, "admin")
    configure(monkeypatch, url="")
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 503


def test_session_ia_reservee_aux_comptes_connectes(client, monkeypatch):
    configure(monkeypatch)
    fake_engine(monkeypatch)
    assert client.post("/api/v1/ia/session").status_code == 401


def test_session_ia_refusee_sans_les_droits_du_compte_technique(client, db, monkeypatch):
    """Un rôle personnalisé avec `ia.use` mais sans `quality.read` ne lit pas l'état Qualiopi par l'assistant."""
    from app.types.auth import CustomRole

    configure(monkeypatch)
    fake_engine(monkeypatch)
    db.add_all([CustomRole(code="ia_seule", label="IA seule", permissions=["ia.use"]),
                CustomRole(code="ia_lecture", label="IA et lecture",
                           permissions=["ia.use", "quality.read", "sessions.read"])])
    db.commit()
    _, headers = make_user(db, "ia_seule", email="ia-seule@test.local")
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 403
    assert "quality.read" in r.json()["detail"] and "sessions.read" in r.json()["detail"]
    _, headers = make_user(db, "ia_lecture", email="ia-lecture@test.local")
    assert client.post("/api/v1/ia/session", headers=headers).status_code == 200
