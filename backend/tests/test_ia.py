"""Passerelle vers le moteur IA : une seule connexion, compte de service côté serveur, compte navigateur remis au front."""

from app.application.service.ia import espace
from app.application.service.ia import session as ia
from app.config.config import get_settings
from tests.conftest import make_user

SERVICE = "service@gsms.local"


def configure(monkeypatch, url="http://ia-app:8080"):  # noqa: ANN001, ANN201
    s = get_settings()
    monkeypatch.setattr(s, "weknora_url", url)
    monkeypatch.setattr(s, "weknora_service_email", SERVICE)
    monkeypatch.setattr(s, "weknora_service_password", "mot-de-passe-de-service")


def fake_engine(monkeypatch, registration_open: bool = True):  # noqa: ANN001, ANN201
    """Moteur simulé : comptes inscrits au premier appel, espace de l'organisme = 1, espaces personnels = 2, 3…"""
    state = {"accounts": {}, "members": {SERVICE: "owner"}, "calls": [], "open": registration_open, "names": set(),
             "links": {}, "revoked": [], "invite_status": 200}

    def token_of(email: str) -> str:
        return "jeton-weknora" if email == SERVICE else f"jeton:{email}"

    def login_body(email: str) -> dict:
        tenant = state["accounts"][email]["tenant"]
        token = token_of(email) + ("" if email == SERVICE or tenant != 1 else "-espace")
        memberships = [{"tenant_id": state["accounts"][email]["home"]}]
        if email in state["members"] and email != SERVICE:
            memberships.append({"tenant_id": 1})
        return {"success": True, "token": token, "refresh_token": "rt-7-jours", "user": {"email": email},
                "active_tenant": {"id": tenant}, "memberships": memberships}

    def post(path, payload, token=None):  # noqa: ANN001, ANN202
        state["calls"].append(path)
        if path == "/api/v1/auth/register":
            if not state["open"]:
                return 403, {"success": False, "error": {"message": "Public registration is disabled"}}
            email = payload["email"]
            assert email == SERVICE, "un compte d'utilisateur ne passe jamais par l'inscription libre"
            state["accounts"][email] = {"password": payload["password"], "tenant": 1, "home": 1}
            return 201, {"success": True}
        if path == "/api/v1/auth/login":
            account = state["accounts"].get(payload["email"])
            if account and account["password"] == payload["password"]:
                return 200, login_body(payload["email"])
            return 401, {"success": False}
        if path == "/api/v1/tenants/1/invite-links":
            assert token == "jeton-weknora" and payload["role"] == "contributor"
            link_id = len(state["links"]) + 1
            state["links"][f"lien-{link_id}"] = link_id
            return 201, {"success": True, "data": {"id": link_id, "invite_url": f"http://x/register?token=lien-{link_id}"}}
        if path == "/api/v1/auth/register-by-invite":
            if not state["open"]:
                return 403, {"success": False, "error": {"message": "Registration is disabled"}}
            if state["invite_status"] != 200:
                return state["invite_status"], {"success": False, "error": {"message": "refus simulé"}}
            assert payload["token"] in state["links"] and state["links"][payload["token"]] not in state["revoked"]
            email = payload["email"]
            assert len(payload["password"]) <= 32 and "!" in payload["password"]
            assert 2 <= len(payload["username"]) <= 50 and payload["username"] not in state["names"]
            state["names"].add(payload["username"])
            state["accounts"][email] = {"password": payload["password"], "tenant": 1, "home": 1}
            state["members"][email] = "contributor"  # l'invitation fait entrer dans l'espace avec son rôle
            return 200, {"success": True}
        if path == "/api/v1/tenants/1/members":
            assert token == "jeton-weknora" and payload["role"] == "contributor"
            assert payload["email"].startswith("service+u-") and payload["email"] not in state["members"]
            state["members"][payload["email"]] = "contributor"
            return 200, {"success": True}
        if path == "/api/v1/auth/switch-tenant":
            email = next(e for e in state["accounts"] if token == token_of(e))
            assert state["members"].get(email) and payload == {"tenant_id": 1}
            state["accounts"][email]["tenant"] = 1
            return 200, login_body(email)
        raise AssertionError(f"appel inattendu {path}")

    def call(method, path, payload=None, token=None, timeout=30):  # noqa: ANN001, ANN202, ARG001
        state["calls"].append(f"{method} {path}")
        assert method == "DELETE" and path.startswith("/api/v1/tenants/1/invitations/") and token == "jeton-weknora"
        state["revoked"].append(int(path.rsplit("/", 1)[1]))
        return 200, {"success": True}

    monkeypatch.setattr(ia, "_post", post)
    monkeypatch.setattr(ia, "call", call)
    # Déclaration MCP sans objet ici (voir test_ia_espace.py) : l'espace simulé n'a aucun service.
    if not getattr(espace.call, "is_workspace", False):
        monkeypatch.setattr(espace, "call", lambda *a, **k: (200, {"success": True, "data": []}) if a[0] == "GET"
                            else (200, {"success": True, "data": {"id": "svc"}}))
    return state


def test_session_ia_compte_weknora_contributeur_sans_jeton_de_renouvellement(client, db, monkeypatch):
    user, headers = make_user(db, "admin")
    configure(monkeypatch)
    state = fake_engine(monkeypatch)
    email = ia.browser_email(user.id)
    assert email.startswith("service+u-") and user.id not in email

    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 200
    body = r.json()
    # Le navigateur reçoit le compte contributeur de cette personne, dans l'espace de l'organisme, jamais le compte de service.
    assert body["token"] == f"jeton:{email}-espace"
    assert body["active_tenant"]["id"] == 1 and body["user"]["email"] == email
    assert "jeton-weknora" not in r.text
    assert "refresh_token" not in body and "rt-7-jours" not in r.text
    assert state["members"][email] == "contributor"
    # Compte créé par une invitation de l'espace, révoquée aussitôt.
    assert state["calls"][-5:] == ["/api/v1/auth/login", "/api/v1/tenants/1/invite-links", "/api/v1/auth/register-by-invite",
                                   "DELETE /api/v1/tenants/1/invitations/1", "/api/v1/auth/login"]
    assert state["revoked"] == [1]

    # Appels suivants (renouvellement) : simples connexions, WeKnora a retenu l'espace de l'organisme.
    state["calls"].clear()
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.json()["token"] == f"jeton:{email}-espace" and "refresh_token" not in r.json()
    assert state["calls"] == ["/api/v1/auth/login", "/api/v1/auth/login"]


def test_chaque_compte_gsms_a_son_compte_weknora(client, db, monkeypatch):
    """WeKnora range les conversations par compte : deux personnes ne partagent jamais le même."""
    configure(monkeypatch)
    state = fake_engine(monkeypatch)
    tokens = set()
    for role in ("qualite", "gestion"):
        user, headers = make_user(db, role, email=f"{role}@test.local")
        body = client.post("/api/v1/ia/session", headers=headers).json()
        assert body["user"]["email"] == ia.browser_email(user.id)
        tokens.add(body["token"])
    assert len(tokens) == 2
    assert len([e for e, r in state["members"].items() if r == "contributor"]) == 2


def test_compte_deja_membre_bascule_sans_etre_rajoute(client, db, monkeypatch):
    """Membre de l'espace mais connecté ailleurs : bascule directe, sans nouvelle demande d'ajout."""
    user, headers = make_user(db, "qualite")
    configure(monkeypatch)
    state = fake_engine(monkeypatch)
    client.post("/api/v1/ia/session", headers=headers)
    state["accounts"][ia.browser_email(user.id)]["tenant"] = 7  # connecté dans un autre espace
    state["calls"].clear()
    assert client.post("/api/v1/ia/session", headers=headers).status_code == 200
    assert "/api/v1/tenants/1/members" not in state["calls"] and "/api/v1/auth/switch-tenant" in state["calls"]


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
    assert r.status_code == 503 and "Première installation" in r.json()["detail"]


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


def test_invitation_revoquee_meme_si_l_inscription_echoue(client, db, monkeypatch):
    _, headers = make_user(db, "qualite")
    configure(monkeypatch)
    state = fake_engine(monkeypatch)
    client.post("/api/v1/ia/session", headers=make_user(db, "admin", email="adm@test.local")[1])  # compte de service créé
    state["invite_status"] = 409
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 503 and "non créé" in r.json()["detail"]
    assert len(state["revoked"]) == len(state["links"]) == 2


def test_deux_premieres_sessions_simultanees(client, db, monkeypatch):
    """Le compte a été créé par une autre première session entre-temps : on s'y connecte au lieu d'échouer."""
    user, headers = make_user(db, "qualite")
    configure(monkeypatch)
    state = fake_engine(monkeypatch)
    client.post("/api/v1/ia/session", headers=make_user(db, "admin", email="adm@test.local")[1])  # compte de service créé
    real_post = ia._post

    def concurrent(path, payload, token=None):  # noqa: ANN001, ANN202
        if path == "/api/v1/auth/register-by-invite":
            real_post(path, payload, token)  # l'autre onglet crée le compte...
            return 409, {"success": False, "error": {"message": "this email already has an account"}}  # ...et nous, refusés
        return real_post(path, payload, token)

    monkeypatch.setattr(ia, "_post", concurrent)
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 200 and r.json()["user"]["email"] == ia.browser_email(user.id)
    assert len(state["revoked"]) == len(state["links"])
