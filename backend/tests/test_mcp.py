"""Serveur MCP du moteur Qualiopi : protocole, authentification, droits et outils en lecture seule."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.ia.compte import ROLE, mcp_token, technical_account
from app.handler.mcp_outils import TOOLS
from app.types import training as t
from app.types.qualiopi_evidence import Evidence
from tests.conftest import find_session, make_user

URL = "/api/v1/mcp"


def rpc(client, headers: dict, method: str, params: dict | None = None, rid: int | None = 1):  # noqa: ANN001, ANN201
    message = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {})}
    if rid is not None:
        message["id"] = rid
    return client.post(URL, json=message, headers=headers)


def tool(client, headers: dict, name: str, **arguments):  # noqa: ANN001, ANN003, ANN201
    r = rpc(client, headers, "tools/call", {"name": name, "arguments": arguments})
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    text = result["content"][0]["text"]
    return result["isError"], (text if result["isError"] else json.loads(text))


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_poignee_de_main_et_liste_des_outils(client, db: Session) -> None:  # noqa: ANN001
    h = bearer(mcp_token(db))
    db.commit()
    r = rpc(client, h, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                      "clientInfo": {"name": "test", "version": "1"}})
    assert r.status_code == 200
    init = r.json()["result"]
    assert init["protocolVersion"] == "2025-06-18"
    assert init["capabilities"] == {"tools": {"listChanged": False}}
    assert "certificateur" in init["instructions"]
    assert "Mcp-Session-Id" not in r.headers
    # Version inconnue : la plus récente comprise.
    assert rpc(client, h, "initialize", {"protocolVersion": "1999-01-01"}).json()["result"]["protocolVersion"] == "2025-11-25"

    assert rpc(client, h, "notifications/initialized", rid=None).status_code == 202
    assert rpc(client, h, "ping").json()["result"] == {}
    # Le client WeKnora tente d'abord la découverte : « méthode inconnue » le ramène à `initialize`.
    assert rpc(client, h, "server/discover").json()["error"]["code"] == -32601

    tools = rpc(client, h, "tools/list").json()["result"]["tools"]
    assert [t["name"] for t in tools] == [t.name for t in TOOLS]
    assert {"etat_indicateurs", "fiche_indicateur", "lister_preuves", "fiche_preuve", "lister_ecarts",
            "lister_echeances", "lister_actions_correctives", "synthese_session", "fiche_formation",
            "lister_sessions", "planning", "lister_audits", "lister_veille", "lister_reclamations"} == {t["name"] for t in tools}
    assert all(t["annotations"]["readOnlyHint"] for t in tools)
    assert all(t["inputSchema"]["type"] == "object" for t in tools)
    # Aucun texte ne prononce la conformité.
    assert "conforme" not in json.dumps(tools, ensure_ascii=False).lower().replace("non conforme", "")

    assert client.get(URL, headers=h).status_code == 405
    assert client.post(URL, content=b"{pas du json", headers=h).json()["error"]["code"] == -32700
    lot = client.post(URL, json=[{"jsonrpc": "2.0", "id": 1, "method": "ping"},
                                 {"jsonrpc": "2.0", "method": "notifications/initialized"}], headers=h)
    assert lot.json() == [{"jsonrpc": "2.0", "id": 1, "result": {}}]


def test_authentification_obligatoire_et_jeton_cantonne_au_mcp(client, db: Session) -> None:  # noqa: ANN001
    assert rpc(client, {}, "ping").status_code == 401
    assert rpc(client, {}, "ping").headers["www-authenticate"] == "Bearer"
    assert rpc(client, bearer("n-importe-quoi"), "ping").status_code == 401

    token = mcp_token(db)
    db.commit()
    assert rpc(client, bearer(token), "ping").status_code == 200
    # Le jeton « mcp » n'ouvre aucune autre route de l'API.
    assert client.get("/api/v1/auth/me", headers=bearer(token)).status_code == 401
    assert client.get("/api/v1/qualiopi/readiness", headers=bearer(token)).status_code == 401

    # Un utilisateur GSMS peut aussi appeler le serveur avec son propre jeton.
    _, h = make_user(db, "qualite")
    assert rpc(client, h, "ping").status_code == 200

    # Arrivé par un proxy public, le jeton « mcp » est refusé ; un jeton utilisateur reste accepté.
    assert rpc(client, {**bearer(token), "X-Forwarded-For": "203.0.113.7"}, "ping").status_code == 401
    assert rpc(client, {**bearer(token), "Forwarded": "for=203.0.113.7"}, "ping").status_code == 401
    assert rpc(client, {**h, "X-Forwarded-For": "203.0.113.7"}, "ping").status_code == 200

    # Origine de navigateur inconnue : refus (protection contre le « DNS rebinding »).
    assert rpc(client, {**bearer(token), "Origin": "https://ailleurs.example"}, "ping").status_code == 403


def test_compte_technique_droits_explicites_revocation_et_renouvellement(client, db: Session) -> None:  # noqa: ANN001
    account = technical_account(db)
    assert account.roles == [ROLE]
    assert technical_account(db).id == account.id  # créé une seule fois
    old = mcp_token(db)
    db.commit()
    # Mot de passe aléatoire jamais communiqué : impossible de se connecter.
    assert client.post("/api/v1/auth/login", json={"email": account.email, "password": ""}).status_code != 200

    roles = {r["code"]: r for r in client.get("/api/v1/auth/roles", headers=make_user(db, "admin")[1]).json()}
    assert sorted(roles[ROLE]["permissions"]) == ["quality.read", "sessions.read"]

    new = mcp_token(db, renew=True)
    db.commit()
    assert rpc(client, bearer(old), "ping").status_code == 401
    assert rpc(client, bearer(new), "ping").status_code == 200

    account.is_active = False
    db.commit()
    assert rpc(client, bearer(new), "ping").status_code == 401


def test_droit_manquant_ou_module_eteint_donne_un_refus_lisible(client, demo: Session) -> None:  # noqa: ANN001
    _, formateur = make_user(demo, "formateur")
    is_error, text = tool(client, formateur, "etat_indicateurs")
    assert is_error and "quality.read" in text

    h = bearer(mcp_token(demo))
    demo.commit()
    _, admin = make_user(demo, "admin")
    assert client.put("/api/v1/features/qualiopi", json={"enabled": False}, headers=admin).status_code == 200
    is_error, text = tool(client, h, "lister_preuves")
    assert is_error and "désactivé" in text


def test_outils_reprennent_les_routes_existantes(client, demo: Session) -> None:  # noqa: ANN001
    h = bearer(mcp_token(demo))
    demo.commit()
    # Même rôle que le compte technique : les capacités renvoyées (boutons permis) sont donc les mêmes.
    _, user = make_user(demo, ROLE, email="pair@test.local")

    _, readiness = tool(client, h, "etat_indicateurs")
    assert readiness == client.get("/api/v1/qualiopi/readiness", headers=user).json()
    assert "Ne constitue pas une décision de conformité" in readiness["disclaimer"]

    _, chain = tool(client, h, "fiche_indicateur", numero=11)
    assert chain == client.get("/api/v1/qualiopi/indicateurs/11", headers=user).json()
    is_error, text = tool(client, h, "fiche_indicateur", numero=98)
    assert is_error

    _, evidence = tool(client, h, "lister_preuves", limite=3)
    full = client.get("/api/v1/qualiopi/preuves", headers=user).json()
    assert evidence["total"] == full["total"] and len(evidence["preuves"]) == min(3, full["total"])
    ref = evidence["preuves"][0]["reference"]
    _, sheet = tool(client, h, "fiche_preuve", preuve=ref)
    ev = demo.scalar(select(Evidence).where(Evidence.reference == ref))
    assert sheet == client.get(f"/api/v1/qualiopi/preuves/{ev.id}", headers=user).json()
    assert tool(client, h, "fiche_preuve", preuve="INCONNUE")[0]

    _, gaps = tool(client, h, "lister_ecarts")
    assert gaps["statuts"] == ["OUVERT", "EN_TRAITEMENT"]
    assert gaps["total"] == len(client.get("/api/v1/qualiopi/constats?statut=OUVERT&statut=EN_TRAITEMENT",
                                           headers=user).json())
    assert tool(client, h, "lister_ecarts", statut=["CONFORME"])[0]

    _, deadlines = tool(client, h, "lister_echeances", jours=30)
    assert deadlines["echeances"] == client.get("/api/v1/qualiopi/echeances?days=30", headers=user).json()[:50]
    assert tool(client, h, "lister_echeances", jours=1000)[0]

    _, actions = tool(client, h, "lister_actions_correctives")
    assert actions["actions"] == client.get("/api/v1/qualiopi/actions", headers=user).json()[:50]

    session = find_session(demo, "SSIAP1-2026-01")
    _, summary = tool(client, h, "synthese_session", session="SSIAP1-2026-01")
    assert summary == client.get(f"/api/v1/sessions/{session.id}/dossier", headers=user).json()
    assert tool(client, h, "synthese_session", session=session.id)[1] == summary
    is_error, text = tool(client, h, "synthese_session", session="X-0000")
    assert is_error and "introuvable" in text

    is_error, text = tool(client, h, "outil_inconnu")
    assert is_error and "inconnu" in text


def test_fiche_formation_par_identifiant_code_ou_slug(client, demo: Session) -> None:  # noqa: ANN001
    h = bearer(mcp_token(demo))
    demo.commit()
    _, user = make_user(demo, ROLE, email="pair@test.local")
    program = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1"))
    expected = client.get(f"/api/v1/qualiopi/formations/{program.id}", headers=user).json()
    assert tool(client, h, "fiche_formation", formation=program.id) == (False, expected)
    assert tool(client, h, "fiche_formation", formation="SSIAP1") == (False, expected)
    if program.catalog_slug:
        assert tool(client, h, "fiche_formation", formation=program.catalog_slug) == (False, expected)
    is_error, text = tool(client, h, "fiche_formation", formation="INCONNUE")
    assert is_error and "introuvable" in text
    assert tool(client, h, "fiche_formation")[0]


def test_lister_sessions_comme_la_route(client, demo: Session) -> None:  # noqa: ANN001
    # Le compte technique a sessions.read : mêmes sessions que la route.
    h = bearer(mcp_token(demo))
    demo.commit()
    is_error, out = tool(client, h, "lister_sessions")
    full = client.get("/api/v1/sessions", headers=make_user(demo, "qualite")[1]).json()
    assert not is_error and out["total"] == len(full) and out["sessions"] == full[:50]

    _, user = make_user(demo, "qualite", email="qualite-sessions@test.local")
    _, out = tool(client, user, "lister_sessions", limite=2)
    full = client.get("/api/v1/sessions", headers=user).json()
    assert out["total"] == len(full) and out["sessions"] == full[:2]
    _, done = tool(client, user, "lister_sessions", statut="TERMINEE", du="2020-01-01", au="2035-12-31")
    assert done["sessions"] == client.get("/api/v1/sessions?statut=TERMINEE&du=2020-01-01&au=2035-12-31",
                                          headers=user).json()[:50]
    assert tool(client, user, "lister_sessions", statut="INCONNU")[0]
    assert tool(client, user, "lister_sessions", du="hier")[0]


def test_planning_comme_la_route(client, demo: Session) -> None:  # noqa: ANN001
    h = bearer(mcp_token(demo))
    demo.commit()
    _, user = make_user(demo, "qualite", email="qualite-planning@test.local")
    for args, query in (({}, ""), ({"du": "2020-01-01", "au": "2020-03-31"}, "?du=2020-01-01&au=2020-03-31"),
                        ({"annulees": True}, "?annulees=true")):
        is_error, out = tool(client, h, "planning", **args)
        assert not is_error, out
        assert out == client.get(f"/api/v1/planning{query}", headers=user).json()
    assert tool(client, h, "planning", du="2020-01-01", au="2021-01-01")[0]  # plus de 93 jours : refus lisible
    assert tool(client, h, "planning", annulees="oui")[0]


def test_lister_audits(client, demo: Session) -> None:  # noqa: ANN001
    h = bearer(mcp_token(demo))
    demo.commit()
    _, user = make_user(demo, ROLE, email="pair@test.local")
    _, out = tool(client, h, "lister_audits")
    full = client.get("/api/v1/qualiopi/audits", headers=user).json()
    assert out["audits"] == full["audits"][:50] and out["total"] == len(full["audits"])
    assert out["avertissement"] == full["avertissement"] and out["capabilities"] == full["capabilities"]

    _, formateur = make_user(demo, "formateur")
    is_error, text = tool(client, formateur, "lister_audits")
    assert is_error and "quality.read" in text


def test_lister_veille_et_reclamations(client, demo: Session) -> None:  # noqa: ANN001
    h = bearer(mcp_token(demo))
    demo.commit()
    _, user = make_user(demo, ROLE, email="pair@test.local")
    _, watch = tool(client, h, "lister_veille", limite=2)
    full = client.get("/api/v1/watch-items", headers=user).json()
    assert full and watch["total"] == len(full) and watch["veille"] == full[:2]

    _, complaints = tool(client, h, "lister_reclamations")
    full = client.get("/api/v1/complaints", headers=user).json()
    assert full and complaints["reclamations"] == full[:50] and complaints["total"] == len(full)

    # Les routes acceptent sessions.read ou quality.read : un formateur (sessions.read_own) est refusé.
    _, formateur = make_user(demo, "formateur")
    is_error, text = tool(client, formateur, "lister_reclamations")
    assert is_error and "sessions.read ou quality.read" in text
