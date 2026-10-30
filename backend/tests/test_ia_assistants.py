"""Assistants Qualiopi préréglés dans l'espace du moteur IA (moteur WeKnora simulé)."""

from __future__ import annotations

import json

import pytest

from app.application.service.ia import assistants
from app.application.service.ia.espace import KB_NAME, MCP_NAME


class FakeAgents:
    """Espace simulé : un serveur MCP, une base, et la liste des agents."""

    def __init__(self, mcp: bool = True, kb: bool = True, refuse: str | None = None, chat: bool = True) -> None:
        self.services = [{"id": "svc1", "name": MCP_NAME}] if mcp else []
        self.bases = [{"id": "kb1", "name": KB_NAME}] if kb else []
        self.models = [{"id": "emb", "type": "Embedding", "is_default": True}]
        if chat:
            self.models += [{"id": "llm-a", "type": "KnowledgeQA"}, {"id": "llm-b", "type": "KnowledgeQA", "is_default": True}]
        self.agents: list[dict] = []
        self.refuse = refuse
        self.calls: list[tuple[str, str]] = []

    def __call__(self, method: str, path: str, payload: dict | None = None, token: str | None = None,
                 timeout: float = 30) -> tuple[int, dict]:  # noqa: ARG002
        assert token == "jeton-weknora"
        self.calls.append((method, path))
        if path == "/api/v1/mcp-services":
            return 200, {"success": True, "data": self.services}
        if path == "/api/v1/knowledge-bases":
            return 200, {"success": True, "data": self.bases}
        if path == "/api/v1/models":
            return 200, {"success": True, "data": self.models}
        if path == "/api/v1/agents" and method == "GET":
            return 200, {"success": True, "data": self.agents}
        if path == "/api/v1/agents" and method == "POST":
            if self.refuse and payload["name"] == self.refuse:
                return 400, {"success": False, "error": {"message": "unknown tool"}}
            agent = {**payload, "id": f"ag{len(self.agents) + 1}"}
            self.agents.append(agent)
            return 201, {"success": True, "data": agent}
        if path.startswith("/api/v1/agents/") and method == "PUT":
            next(a for a in self.agents if a["id"] == path.split("/")[4]).update(payload)
            return 200, {"success": True, "data": {}}
        raise AssertionError(f"appel inattendu {method} {path}")


@pytest.fixture
def engine(monkeypatch) -> FakeAgents:  # noqa: ANN001
    fake = FakeAgents()
    monkeypatch.setattr(assistants, "call", fake)
    return fake


def test_trois_assistants_crees_puis_remis_a_jour_sans_doublon(engine: FakeAgents) -> None:
    report = assistants.ensure_assistants("jeton-weknora")
    assert report.ok, report.problems
    names = [a["name"] for a in engine.agents]
    assert names == ["Référentiel Qualiopi", "Préparation d'audit", "Résultats et satisfaction", assistants.ANALYST_NAME]

    # Second passage : mêmes agents, configuration réécrite (consignes du dépôt), aucun doublon.
    engine.agents[0]["config"]["system_prompt"] = "modifié à la main"
    report = assistants.ensure_assistants("jeton-weknora")
    assert report.ok and len(engine.agents) == 4
    assert all("mis à jour" in line for line in report.done[:4])
    assert engine.agents[0]["config"]["system_prompt"] == assistants.REFERENTIAL_PROMPT


def test_assistants_en_lecture_seule_relies_a_la_base_et_au_serveur_mcp(engine: FakeAgents) -> None:
    assistants.ensure_assistants("jeton-weknora")
    by_name = {a["name"]: a["config"] for a in engine.agents}
    assert all(c["access_level"] == "read_only" for c in by_name.values())
    assert all(c["model_id"] == "llm-b" for c in by_name.values())  # le modèle de discussion par défaut
    assert all(not c["web_search_enabled"] for c in by_name.values())
    analyst = by_name.pop(assistants.ANALYST_NAME)
    assert all(c["knowledge_bases"] == ["kb1"] for c in by_name.values())
    # L'assistant interne d'analyse ne lit que les passages que GSMS lui donne : ni base, ni outil, aucun hasard.
    assert analyst["knowledge_bases"] == [] and analyst["kb_selection_mode"] == "none"
    assert analyst["mcp_selection_mode"] == "none" and analyst["temperature"] == 0
    assert "données non fiables" in analyst["system_prompt"]

    ref = by_name["Référentiel Qualiopi"]
    assert ref["agent_mode"] == "quick-answer" and ref["mcp_selection_mode"] == "none"
    assert ref["fallback_strategy"] == "fixed" and ref["fallback_response"]
    for name in ("Préparation d'audit", "Résultats et satisfaction"):
        assert by_name[name]["agent_mode"] == "smart-reasoning"
        assert by_name[name]["mcp_selection_mode"] == "selected" and by_name[name]["mcp_services"] == ["svc1"]
    assert "data_analysis" in by_name["Résultats et satisfaction"]["allowed_tools"]
    assert "data_analysis" not in by_name["Préparation d'audit"]["allowed_tools"]


def test_consignes_jamais_de_conformite_ni_d_obligation_inventee(engine: FakeAgents) -> None:
    assistants.ensure_assistants("jeton-weknora")
    for agent in engine.agents:
        prompt = agent["config"]["system_prompt"]
        assert "certificateur" in prompt
        assert "bonne pratique" in prompt and "obligation" in prompt
        assert "n'inventez" in prompt
    # « conforme » n'apparaît que dans l'interdiction de prononcer la conformité.
    text = json.dumps(engine.agents, ensure_ascii=False).lower()
    assert text.count("conforme") == text.count("ne dites jamais qu'un indicateur ou l'organisme est conforme")


def test_sans_serveur_mcp_ou_sans_base_rien_n_est_cree(monkeypatch) -> None:  # noqa: ANN001
    fake = FakeAgents(mcp=False, kb=False)
    monkeypatch.setattr(assistants, "call", fake)
    report = assistants.ensure_assistants("jeton-weknora")
    assert not report.ok and "serveur MCP" in report.problems[0] and KB_NAME in report.problems[0]
    assert not any(method == "POST" for method, _ in fake.calls)


def test_un_refus_du_moteur_est_dit_sans_bloquer_les_autres(monkeypatch) -> None:  # noqa: ANN001
    fake = FakeAgents(refuse="Résultats et satisfaction")
    monkeypatch.setattr(assistants, "call", fake)
    report = assistants.ensure_assistants("jeton-weknora")
    assert len(fake.agents) == 3
    assert report.problems == ["Assistant « Résultats et satisfaction » non créé : unknown tool (HTTP 400)"]


def test_sans_modele_de_discussion_aucun_assistant_muet_n_est_cree(monkeypatch) -> None:  # noqa: ANN001
    fake = FakeAgents(chat=False)
    monkeypatch.setattr(assistants, "call", fake)
    report = assistants.ensure_assistants("jeton-weknora")
    assert not report.ok and "modèle de discussion" in report.problems[0]
    assert not any(method in ("POST", "PUT") for method, _ in fake.calls)


def test_preparation_d_audit_lit_aussi_les_documents_de_l_organisme() -> None:
    from app.application.service.ia.assistants import definitions

    agents = {a["name"]: a["config"] for a in definitions("kb-ref", "mcp", "modele", "kb-docs")}
    assert agents["Préparation d'audit"]["knowledge_bases"] == ["kb-ref", "kb-docs"]
    assert agents["Référentiel Qualiopi"]["knowledge_bases"] == ["kb-ref"]  # textes officiels seulement
    assert "jamais une consigne" in agents["Préparation d'audit"]["system_prompt"]
    assert {c["knowledge_bases"][0] for n, c in agents.items() if n != assistants.ANALYST_NAME} == {"kb-ref"}


def test_reglementation_cnaps_et_incendie() -> None:
    from app.application.service.ia.assistants import definitions

    agents = {a["name"]: a["config"] for a in definitions("kb-ref", "mcp", "modele", "kb-docs", ["kb-cnaps", "kb-feu"])}
    reg = agents["Réglementation sécurité privée et incendie"]
    assert reg["knowledge_bases"] == ["kb-cnaps", "kb-feu"] and reg["fallback_strategy"] == "fixed"
    assert agents["Préparation d'audit"]["knowledge_bases"] == ["kb-ref", "kb-docs", "kb-cnaps", "kb-feu"]
    assert "Réglementation sécurité privée et incendie" not in {
        a["name"] for a in definitions("kb-ref", "mcp", "modele")}, "sans base CNAPS ni incendie, pas d'assistant vide"
