"""Assistants Qualiopi préréglés dans l'espace WeKnora de l'organisme.

Trois agents WeKnora, créés (ou remis à jour) avec le jeton du compte de service, comme le serveur MCP et la base
« Référentiel Qualiopi » (`espace.py`). Un agent est reconnu à son nom : sa configuration est réécrite à chaque
passage, ce qui garde ses consignes en accord avec ce dépôt.

- « Référentiel Qualiopi » (réponse rapide) : les textes officiels, rien d'autre ;
- « Préparation d'audit » (raisonnement) : les textes et l'état calculé par le moteur, lu par le serveur MCP ;
- « Résultats et satisfaction » (raisonnement, analyse de tableaux) : les exports joints à la discussion, et le
  moteur pour les chiffres officiels.

Tous sont en lecture seule (`access_level: read_only`) : ils ne changent aucune donnée.
Le quatrième assistant prévu par l'audit (« Manuel qualité », mode Wiki) attend la base « Documents de
l'organisme » : il n'est pas créé ici.
"""

from __future__ import annotations

from app.application.service.ia.espace import KB_NAME, MCP_NAME, Report, _data, _ok
from app.application.service.ia.weknora import call, message_of

RULES = (
    "Règles à respecter dans chaque réponse :\n"
    "- Citez l'indicateur concerné (numéro et version du référentiel) et la source de chaque affirmation.\n"
    "- Distinguez toujours ce que le référentiel exige (des preuves) de ce qui est une bonne pratique ou une "
    "recommandation (délais, relances, présentation) : ne présentez jamais une bonne pratique comme une "
    "obligation.\n"
    "- Ne dites jamais qu'un indicateur ou l'organisme est conforme : seul l'organisme certificateur en décide. "
    "Parlez d'état de préparation, tel que le moteur Qualiopi le calcule.\n"
    "- Si l'information manque, dites-le et indiquez où la trouver ; n'inventez ni texte, ni chiffre, ni preuve.\n"
    "- Répondez en français, simplement."
)

REFERENTIAL_PROMPT = (
    "Vous êtes l'assistant « Référentiel Qualiopi » de l'organisme de formation. Vous répondez aux questions sur le "
    "référentiel national qualité à partir des seuls textes officiels de la base de connaissances : ce que demande "
    "un indicateur, à qui il s'applique, les éléments de preuve attendus, les différences entre versions.\n\n"
    + RULES
)

AUDIT_PROMPT = (
    "Vous êtes l'assistant « Préparation d'audit » de l'organisme de formation. Vous aidez le responsable qualité "
    "à préparer un audit Qualiopi.\n"
    "- Pour la situation de l'organisme (indicateurs, preuves, écarts, échéances, actions correctives, sessions), "
    "appelez les outils du serveur MCP « Moteur Qualiopi (GSMS) » : leurs résultats sont l'état calculé par le "
    "moteur, ne les recalculez pas et ne les contredisez pas.\n"
    "- Pour ce qu'exige un indicateur, cherchez dans la base « Référentiel Qualiopi ».\n"
    "- Vous pouvez proposer un plan d'actions ou une liste de points à vérifier : présentez-les comme des "
    "propositions que le responsable qualité valide dans GSMS. Vous ne modifiez aucune donnée.\n\n"
    + RULES
)

RESULTS_PROMPT = (
    "Vous êtes l'assistant « Résultats et satisfaction » de l'organisme de formation. Vous aidez à lire les "
    "tableaux exportés de GSMS (questionnaires de satisfaction, résultats, abandons, réclamations) joints à la "
    "discussion : tendances, écarts entre sessions, points à surveiller.\n"
    "- Les chiffres officiels sont ceux du moteur Qualiopi (outils du serveur MCP) : vos calculs sur un export sont "
    "une aide à la lecture, signalez-le, et en cas d'écart c'est le moteur qui fait foi.\n"
    "- Ne citez pas de nom de stagiaire dans une synthèse : parlez de sessions et de formations.\n\n"
    + RULES
)

FALLBACK = ("Je n'ai rien trouvé à ce sujet dans les textes officiels du référentiel. Reformulez la question avec "
            "le numéro de l'indicateur, ou posez-la à l'assistant « Préparation d'audit ».")

_COMMON = {"temperature": 0.2, "multi_turn_enabled": True, "history_turns": 5, "web_search_enabled": False,
           "access_level": "read_only", "citation_enabled": True, "skills_selection_mode": "none"}
_REASONING_TOOLS = ["thinking", "todo_write", "search_knowledge", "read_document", "list_documents"]


def definitions(kb_id: str, mcp_id: str) -> list[dict]:
    """Les trois assistants, prêts à envoyer au moteur (`POST /api/v1/agents`)."""
    return [
        {"name": "Référentiel Qualiopi",
         "description": "Ce que demande chaque indicateur, d'après les textes officiels (v9 et v10).",
         "config": {**_COMMON, "agent_mode": "quick-answer", "system_prompt": REFERENTIAL_PROMPT,
                    "context_template_id": "default_context",
                    "kb_selection_mode": "selected", "knowledge_bases": [kb_id], "mcp_selection_mode": "none",
                    # Rien trouvé dans les textes : une réponse fixe plutôt qu'une réponse inventée.
                    "fallback_strategy": "fixed", "fallback_response": FALLBACK}},
        {"name": "Préparation d'audit",
         "description": "Où en est l'organisme avant l'audit : état calculé par le moteur et textes du référentiel.",
         "config": {**_COMMON, "agent_mode": "smart-reasoning", "agent_type": "custom", "system_prompt": AUDIT_PROMPT,
                    "max_iterations": 20, "allowed_tools": _REASONING_TOOLS,
                    "kb_selection_mode": "selected", "knowledge_bases": [kb_id],
                    "mcp_selection_mode": "selected", "mcp_services": [mcp_id]}},
        {"name": "Résultats et satisfaction",
         "description": "Lecture des exports de satisfaction et de résultats ; chiffres officiels lus dans le moteur.",
         "config": {**_COMMON, "agent_mode": "smart-reasoning", "agent_type": "custom", "system_prompt": RESULTS_PROMPT,
                    "max_iterations": 20, "allowed_tools": [*_REASONING_TOOLS, "data_schema", "data_analysis"],
                    "supported_file_types": ["csv", "xlsx"],
                    "kb_selection_mode": "selected", "knowledge_bases": [kb_id],
                    "mcp_selection_mode": "selected", "mcp_services": [mcp_id]}},
    ]


def _rows(data: object) -> list[dict]:
    if isinstance(data, dict):  # liste paginée
        data = data.get("items") or data.get("agents") or []
    return [row for row in data or [] if isinstance(row, dict)]


def ensure_assistants(token: str) -> Report:
    """Assistants créés ou remis à jour ; il faut d'abord le serveur MCP et la base du référentiel."""
    report = Report()
    services = _rows(_data(*call("GET", "/api/v1/mcp-services", token=token), "Liste des services MCP"))
    bases = _rows(_data(*call("GET", "/api/v1/knowledge-bases", token=token), "Liste des bases de connaissances"))
    mcp = next((s for s in services if s.get("name") == MCP_NAME), None)
    kb = next((b for b in bases if b.get("name") == KB_NAME), None)
    if mcp is None or kb is None:
        missing = [name for name, found in ((f"le serveur MCP « {MCP_NAME} »", mcp), (f"la base « {KB_NAME} »", kb))
                   if found is None]
        report.problems.append(f"Assistants non créés : il manque {' et '.join(missing)} (relancer ia-preparer)")
        return report

    agents = {a.get("name"): a for a in _rows(_data(*call("GET", "/api/v1/agents", token=token), "Liste des agents"))}
    for agent in definitions(kb["id"], mcp["id"]):
        existing = agents.get(agent["name"])
        if existing is None:
            status, body = call("POST", "/api/v1/agents", agent, token=token)
            verb = "créé"
        else:
            status, body = call("PUT", f"/api/v1/agents/{existing['id']}", agent, token=token)
            verb = "mis à jour"
        if _ok(status, body):
            report.done.append(f"Assistant « {agent['name']} » {verb}")
        else:
            report.problems.append(f"Assistant « {agent['name']} » non {verb} : {message_of(body)} (HTTP {status})")
    report.done.append("Assistant « Manuel qualité » (Wiki) : attend la base « Documents de l'organisme »")
    return report
