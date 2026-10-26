"""Espace du moteur IA : déclaration du serveur MCP et base « Référentiel Qualiopi » (moteur WeKnora simulé)."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.application.service.ia import espace
from app.application.service.ia.compte import mcp_token
from app.config.config import get_settings
from tests.conftest import make_user
from tests.test_ia import configure, fake_engine


class FakeWorkspace:
    """Espace WeKnora simulé : services MCP, bases de connaissances, documents, modèles."""

    is_workspace = True  # fake_engine (test_ia.py) ne le remplace pas

    def __init__(self, embeddings: int = 1, kb_refused: str | None = None, ssrf: bool = False) -> None:
        self.services: list[dict] = []
        self.bases: list[dict] = []
        self.knowledge: dict[str, list[dict]] = {}
        self.models = [{"id": f"m{i}", "type": "Embedding"} for i in range(embeddings)]
        self.kb_refused, self.ssrf = kb_refused, ssrf
        self.calls: list[tuple[str, str]] = []
        self.tokens: dict[str, str] = {}

    def __call__(self, method: str, path: str, payload: dict | None = None, token: str | None = None,
                 timeout: float = 30) -> tuple[int, dict]:  # noqa: ARG002
        assert token == "jeton-weknora"
        self.calls.append((method, path.split("?")[0]))
        path = path.split("?")[0]
        if path == "/api/v1/mcp-services" and method == "GET":
            return 200, {"success": True, "data": self.services}
        if path == "/api/v1/mcp-services" and method == "POST":
            if self.ssrf:
                return 400, {"success": False, "error": {"message": "MCP service URL failed SSRF validation"}}
            token_value = payload["auth_config"].pop("token")
            service = {**payload, "id": f"svc{len(self.services) + 1}",
                       "credentials": {"token": {"configured": True}}}
            self.tokens[service["id"]] = token_value
            self.services.append(service)
            return 200, {"success": True, "data": service}
        if path.startswith("/api/v1/mcp-services/") and path.endswith("/credentials"):
            sid = path.split("/")[4]
            self.tokens[sid] = payload["token"]
            next(s for s in self.services if s["id"] == sid)["credentials"] = {"token": {"configured": True}}
            return 200, {"success": True, "data": {"fields": {"token": {"configured": True}}}}
        if path.startswith("/api/v1/mcp-services/") and method == "PUT":
            next(s for s in self.services if s["id"] == path.split("/")[4]).update(payload)
            return 200, {"success": True, "data": {}}
        if path == "/api/v1/models":
            return 200, {"success": True, "data": self.models}
        if path == "/api/v1/knowledge-bases" and method == "GET":
            return 200, {"success": True, "data": self.bases}
        if path == "/api/v1/knowledge-bases" and method == "POST":
            if self.kb_refused:
                return 400, {"success": False, "error": {"message": self.kb_refused}}
            # Le moteur retient son modèle d'embedding par défaut quand il en a un.
            kb = {**payload, "id": f"kb{len(self.bases) + 1}", "embedding_model_id": "m0" if self.models else "",
                  "chunking_config": {"chunk_size": 512, "chunk_overlap": 50, "separators": ["\n\n"]}}
            self.bases.append(kb)
            self.knowledge[kb["id"]] = []
            return 201, {"success": True, "data": kb}  # le vrai moteur répond 201 ici
        if path.endswith("/knowledge") and method == "GET":
            return 200, {"success": True, "data": self.knowledge[path.split("/")[4]]}
        if path.endswith("/knowledge/manual"):
            assert payload["status"] == "publish" and payload["content"]
            doc = {"id": f"k{sum(map(len, self.knowledge.values()))}", "title": payload["title"],
                   "parse_status": "pending" if self.models else "failed",
                   "error_message": "" if self.models else "embedding model not configured"}
            self.knowledge[path.split("/")[4]].append(doc)
            return 200, {"success": True, "data": doc}
        if path.startswith("/api/v1/initialization/config/") and method == "PUT":
            kb = next(b for b in self.bases if b["id"] == path.split("/")[5])
            assert payload["llmModelId"] and payload["embeddingModelId"]
            assert payload["documentSplitting"]["chunkOverlap"] == 50  # découpage de la base conservé
            kb["embedding_model_id"] = payload["embeddingModelId"]
            return 200, {"success": True}
        if path.startswith("/api/v1/knowledge/") and path.endswith("/reparse"):
            doc = next(d for docs in self.knowledge.values() for d in docs if d["id"] == path.split("/")[4])
            doc.update(parse_status="pending", error_message="")
            return 200, {"success": True}
        raise AssertionError(f"appel inattendu {method} {path}")


@pytest.fixture
def workspace(monkeypatch) -> FakeWorkspace:  # noqa: ANN001
    ws = FakeWorkspace()
    monkeypatch.setattr(espace, "call", ws)
    return ws


def test_serveur_mcp_declare_a_l_ouverture_de_session_une_seule_fois(client, db: Session, monkeypatch,
                                                                      workspace: FakeWorkspace) -> None:  # noqa: ANN001
    _, headers = make_user(db, "gestion")
    configure(monkeypatch)
    fake_engine(monkeypatch)

    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 200
    assert r.json()["token"] == "jeton-navigateur-espace"
    assert r.json()["gsms_mcp"]["ok"] is True
    [service] = workspace.services
    assert service["name"] == espace.MCP_NAME
    assert service["transport_type"] == "http-streamable"
    assert service["url"] == get_settings().ia_mcp_url == "http://api:8000/api/v1/mcp"
    assert service["auth_config"] == {"auth_type": "bearer"}
    # Le jeton remis au moteur est bien celui du compte technique et ouvre le serveur MCP.
    token = workspace.tokens["svc1"]
    assert token == mcp_token(db)
    assert client.post("/api/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
                       headers={"Authorization": f"Bearer {token}"}).status_code == 200

    workspace.calls.clear()
    assert client.post("/api/v1/ia/session", headers=headers).json()["gsms_mcp"]["ok"] is True
    assert workspace.calls == [("GET", "/api/v1/mcp-services")]  # rien à refaire
    assert len(workspace.services) == 1


def test_adresse_corrigee_et_service_desactive_respecte(db: Session, workspace: FakeWorkspace) -> None:
    espace.ensure_mcp_service(db, "jeton-weknora")
    workspace.services[0].update(url="http://ancienne:8000/mcp", enabled=False)
    report = espace.ensure_mcp_service(db, "jeton-weknora")
    assert workspace.services[0]["url"] == "http://api:8000/api/v1/mcp"
    assert workspace.services[0]["enabled"] is False
    assert any("corrigé" in line for line in report.done)
    assert any("désactivé" in line for line in report.problems)


def test_renouvellement_du_jeton(db: Session, workspace: FakeWorkspace) -> None:
    espace.ensure_mcp_service(db, "jeton-weknora")
    old = workspace.tokens["svc1"]
    report = espace.ensure_mcp_service(db, "jeton-weknora", renew=True)
    assert workspace.tokens["svc1"] != old
    assert any("renouvelé" in line for line in report.done)


def test_refus_ssrf_explique(db: Session, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(espace, "call", FakeWorkspace(ssrf=True))
    report = espace.ensure_mcp_service(db, "jeton-weknora")
    assert not report.ok and "SSRF_WHITELIST_EXTRA=api" in report.problems[0]


def test_session_ouverte_meme_si_la_declaration_echoue(client, db: Session, monkeypatch) -> None:  # noqa: ANN001
    _, headers = make_user(db, "gestion")
    configure(monkeypatch)
    fake_engine(monkeypatch)

    def down(*_a, **_k):  # noqa: ANN002, ANN003, ANN202
        raise espace.IAUnavailable("Moteur IA injoignable")

    monkeypatch.setattr(espace, "call", down)
    r = client.post("/api/v1/ia/session", headers=headers)
    assert r.status_code == 200 and r.json()["token"] == "jeton-navigateur-espace"
    assert r.json()["gsms_mcp"]["ok"] is False


def test_base_referentiel_creee_et_alimentee_une_seule_fois(workspace: FakeWorkspace) -> None:
    sources = espace.referential_sources()
    assert len(sources) == 65  # 32 indicateurs en v9, 33 en v10
    assert sources[0][0].startswith("Qualiopi v10 — indicateur 1 —")

    report = espace.ensure_referential_kb("jeton-weknora")
    assert report.ok, report.problems
    [kb] = workspace.bases
    assert kb["name"] == "Référentiel Qualiopi"
    assert len(workspace.knowledge[kb["id"]]) == 65
    assert "65 document(s) déposé(s) dans la base" in report.done

    again = espace.ensure_referential_kb("jeton-weknora")
    assert len(workspace.bases) == 1 and len(workspace.knowledge[kb["id"]]) == 65
    assert "65 document(s) déjà présent(s), laissés tels quels" in again.done


def test_sans_modele_d_embedding_on_dit_ce_qui_manque(monkeypatch) -> None:  # noqa: ANN001
    ws = FakeWorkspace(embeddings=0)
    monkeypatch.setattr(espace, "call", ws)
    report = espace.ensure_referential_kb("jeton-weknora")
    assert not report.ok
    assert "Aucun modèle d'embedding" in report.problems[0]
    assert any("échec d'indexation" in p for p in report.problems)

    refused = FakeWorkspace(embeddings=0, kb_refused="embedding model is required")
    monkeypatch.setattr(espace, "call", refused)
    report = espace.ensure_referential_kb("jeton-weknora")
    assert any("non créée : embedding model is required" in p for p in report.problems)
    assert refused.knowledge == {}


def test_documents_en_echec_reindexes_une_fois_le_modele_choisi(monkeypatch) -> None:  # noqa: ANN001
    ws = FakeWorkspace(embeddings=0)
    monkeypatch.setattr(espace, "call", ws)
    report = espace.ensure_referential_kb("jeton-weknora")
    assert any("n'a pas de modèle d'embedding" in p for p in report.problems)

    # L'administrateur ajoute un modèle et le choisit pour la base.
    ws.models = [{"id": "m0", "type": "Embedding"}]
    ws.bases[0]["embedding_model_id"] = "m0"
    report = espace.ensure_referential_kb("jeton-weknora")
    assert report.ok, report.problems
    assert "65 document(s) en échec renvoyé(s) à l'indexation" in report.done
    assert all(d["parse_status"] == "pending" for d in ws.knowledge["kb1"])


def test_modeles_declares_apres_coup_attribues_a_la_base_puis_reindexation(monkeypatch) -> None:  # noqa: ANN001
    ws = FakeWorkspace(embeddings=0)
    monkeypatch.setattr(espace, "call", ws)
    espace.ensure_referential_kb("jeton-weknora")  # base créée sans modèle, documents en échec

    # Modèles déclarés ensuite (ia/config/builtin_models*.yaml) : ia-preparer les attribue à la base.
    ws.models = [{"id": "emb", "type": "Embedding", "is_default": True}, {"id": "llm", "type": "KnowledgeQA"}]
    report = espace.ensure_referential_kb("jeton-weknora")
    assert report.ok, report.problems
    assert ws.bases[0]["embedding_model_id"] == "emb"
    assert any("Modèles par défaut du moteur attribués" in line for line in report.done)
    assert all(d["parse_status"] == "pending" for d in ws.knowledge["kb1"])


def test_client_du_moteur_ia_robuste_aux_reponses_et_coupures(monkeypatch) -> None:  # noqa: ANN001
    import http.client
    import io
    import urllib.request

    from app.application.service.ia import weknora

    monkeypatch.setattr(get_settings(), "weknora_url", "http://ia-app:8080")

    class Resp(io.BytesIO):
        status = 200

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *_):  # noqa: ANN002, ANN204
            return False

    monkeypatch.setattr(urllib.request, "urlopen", lambda *_a, **_k: Resp(b"<html>proxy</html>"))
    assert weknora.call("GET", "/x") == (200, {})
    monkeypatch.setattr(urllib.request, "urlopen", lambda *_a, **_k: Resp(b"[1, 2]"))
    assert weknora.call("GET", "/x") == (200, {})
    for error in (ConnectionResetError("coupé"), http.client.IncompleteRead(b"")):
        def boom(*_a, error=error, **_k):  # noqa: ANN002, ANN003, ANN202
            raise error
        monkeypatch.setattr(urllib.request, "urlopen", boom)
        with pytest.raises(weknora.IAUnavailable):
            weknora.call("GET", "/x")


def test_client_du_moteur_ia_reponses_mal_formees_et_coupures(monkeypatch) -> None:  # noqa: ANN001
    from app.application.service.ia import weknora

    monkeypatch.setattr(get_settings(), "weknora_url", "http://ia-app:8080")

    class Resp:
        status = 200

        def __init__(self, raw: bytes) -> None:
            self.raw = raw

        def read(self) -> bytes:
            return self.raw

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *_a) -> None:  # noqa: ANN002
            return None

    monkeypatch.setattr(weknora.urllib.request, "urlopen", lambda *_a, **_k: Resp(b"<html>proxy</html>"))
    assert weknora.call("GET", "/x") == (200, {})
    monkeypatch.setattr(weknora.urllib.request, "urlopen", lambda *_a, **_k: Resp(b"[1, 2]"))
    assert weknora.call("GET", "/x") == (200, {})

    def reset(*_a, **_k):  # noqa: ANN002, ANN003, ANN202
        raise ConnectionResetError("connexion coupée")

    monkeypatch.setattr(weknora.urllib.request, "urlopen", reset)
    with pytest.raises(weknora.IAUnavailable):
        weknora.call("GET", "/x")
