"""Préparation de l'espace WeKnora de l'organisme : serveur MCP du moteur Qualiopi et bases des référentiels.

Deux opérations idempotentes, appelées avec le jeton du compte de service WeKnora (voir `session.py`) :

- `ensure_mcp_service` : déclare (ou corrige l'adresse de) le serveur MCP de l'API dans l'espace. Appelée à chaque
  ouverture de session IA (légère : une lecture, une écriture au plus) et par `python -m app.cmd.cli ia-preparer`.
  Un service désactivé par un administrateur dans WeKnora reste désactivé. Chaque outil d'action du serveur
  (`mcp_outils.ACTION_TOOLS`) y reçoit « approbation toujours requise » : le moteur suspend l'appel jusqu'au clic
  « Approuver » de la personne dans la conversation. Seules les approbations manquantes sont posées.
- `ensure_referential_kb` : crée une base de connaissances par référentiel (REFERENTIALS : Qualiopi, CNAPS pour la
  sécurité privée, sécurité incendie) et y dépose ses textes officiels (`referentials/<dossier>/**/source/*.md`). Lourde (indexation par le moteur, qui exige un modèle d'embedding) :
  elle n'est lancée que par la commande `ia-preparer`, qui dit ce qui a été fait et ce qui manque.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session

from app.application.service.ia.compte import mcp_token
from app.application.service.ia.weknora import IAUnavailable, call, message_of
from app.config.config import get_settings
from app.handler.mcp_outils import TOOLS

MCP_NAME = "Moteur Qualiopi (GSMS)"
MCP_TRANSPORT = "http-streamable"
MCP_DESCRIPTION = ("Lecture de toute l'application GSMS Qualiopi, avec les droits de la personne qui pose la question : "
                   "état Qualiopi (indicateurs, preuves, écarts, échéances, actions correctives, audits), sessions, "
                   "planning, formations, stagiaires et inscriptions, formateurs et personnel, salles et équipements, "
                   "financement, facturation, EDOF, préinscriptions, documents, évaluations, satisfaction, journal. "
                   "Actions dans GSMS au nom de la personne, chacune après son approbation : créer une session, la faire "
                   "avancer, inscrire, mener le parcours (convocation, attestation…), réévaluer Qualiopi, auditer, "
                   "actions correctives, valider une preuve, financement, facture en brouillon, préinscriptions, "
                   "relances.")
MCP_USAGE = (
    "Utilisez ces outils pour répondre sur tout ce qui se passe dans l'organisme de formation. Pour Qualiopi, ils "
    "renvoient l'état de préparation "
    "calculé par le moteur à partir des preuves disponibles : ce n'est jamais une décision de conformité, que seul "
    "l'organisme certificateur prononce. Le référentiel exige des preuves ; les délais et relances de l'application "
    "sont des recommandations, pas des obligations. Une session ou une preuve se désigne par sa référence. "
    "Les outils d'action enregistrent dans GSMS au nom de la personne : ne les appelez que si elle le demande, après "
    "avoir dit précisément ce qui sera fait ; chacun attend son approbation, et l'application peut refuser avec un "
    "motif, à lui rapporter tel quel."
)
KB_NAME = "Référentiel Qualiopi"
KB_DESCRIPTION = ("Textes officiels des indicateurs du référentiel national qualité (versions 9 et 10), tels que "
                  "livrés avec GSMS Qualiopi (dossiers referentials/qualiopi/v*/source).")


@dataclass(frozen=True)
class Referential:
    """Base de connaissances d'un référentiel : textes officiels livrés dans referentials/<folder>/**/source."""

    name: str
    description: str
    folder: str


QUALIOPI = Referential(KB_NAME, KB_DESCRIPTION, "qualiopi")
CNAPS = Referential(
    "Référentiel CNAPS — sécurité privée",
    "Textes officiels de la sécurité privée (compétence du CNAPS) : livre VI du code de la sécurité intérieure (carte "
    "professionnelle, autorisations d'accès à la formation, organismes de formation), code de déontologie, cahier des "
    "charges de la formation initiale et formation continue (MAC). Livrés avec GSMS Qualiopi (referentials/cnaps).",
    "cnaps")
INCENDIE = Referential(
    "Référentiel sécurité incendie",
    "Textes officiels de la sécurité incendie : arrêté du 2 mai 2005 (SSIAP 1, 2 et 3, recyclage et remise à niveau, "
    "examens) et code du travail (consignes et exercices incendie, secouristes). Livrés avec GSMS Qualiopi "
    "(referentials/incendie).",
    "incendie")
REFERENTIALS = (QUALIOPI, CNAPS, INCENDIE)


@dataclass
class Report:
    """Compte rendu lisible : ce qui a été fait, ce qui manque. Rien n'est simulé."""

    done: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems

    def view(self) -> dict:
        return {"ok": self.ok, "fait": self.done, "a_regler": self.problems}


def _ok(status: int, body: dict) -> bool:
    """Réponse acceptée par le moteur (il répond 200 ou 201 selon les routes)."""
    return status in (200, 201) and body.get("success") is not False


def _data(status: int, body: dict, what: str) -> object:
    if not _ok(status, body):
        raise IAUnavailable(f"{what} : refus du moteur IA (HTTP {status}, {message_of(body)})")
    return body.get("data")


# ── Serveur MCP ──────────────────────────────────────────────────────────────────


def ensure_mcp_service(db: Session, token: str, *, renew: bool = False) -> Report:
    """Serveur MCP déclaré dans l'espace, à la bonne adresse, avec le jeton du compte technique."""
    report = Report()
    url = get_settings().ia_mcp_url
    services = _data(*call("GET", "/api/v1/mcp-services", token=token), "Liste des services MCP") or []
    existing = next((s for s in services if s.get("name") == MCP_NAME), None)
    if existing is None:
        payload = {"name": MCP_NAME, "description": MCP_DESCRIPTION, "usage_instructions": MCP_USAGE,
                   "enabled": True, "transport_type": MCP_TRANSPORT, "url": url,
                   "auth_config": {"auth_type": "bearer", "token": mcp_token(db, renew=renew)},
                   "advanced_config": {"timeout": 30, "retry_count": 1, "retry_delay": 1}}
        status, body = call("POST", "/api/v1/mcp-services", payload, token=token)
        if not _ok(status, body):
            hint = ""
            if "SSRF" in message_of(body):
                hint = " ; le moteur IA doit autoriser l'hôte de l'API (SSRF_WHITELIST_EXTRA=api, voir docker-compose.yml)"
            report.problems.append(f"Serveur MCP non déclaré : {message_of(body)} (HTTP {status}){hint}")
            db.commit()
            return report
        report.done.append(f"Serveur MCP « {MCP_NAME} » déclaré ({url})")
        db.commit()  # compte technique créé au passage
        service_id = (body.get("data") or {}).get("id")
        if service_id:
            _ensure_approvals(service_id, token, report)
        else:
            report.problems.append("Approbations des outils d'action non posées : le moteur IA n'a pas rendu "
                                   "l'identifiant du service MCP")
        return report
    changes = {}
    if existing.get("url") != url:
        changes["url"] = url
    if existing.get("transport_type") != MCP_TRANSPORT:
        changes["transport_type"] = MCP_TRANSPORT
    if existing.get("description") != MCP_DESCRIPTION:
        changes["description"] = MCP_DESCRIPTION
    if existing.get("usage_instructions") != MCP_USAGE:
        changes["usage_instructions"] = MCP_USAGE
    if changes:
        _data(*call("PUT", f"/api/v1/mcp-services/{existing['id']}", changes, token=token), "Mise à jour du service MCP")
        report.done.append(f"Serveur MCP « {MCP_NAME} » corrigé : {', '.join(sorted(changes))}")
    configured = ((existing.get("credentials") or {}).get("token") or {}).get("configured")
    if renew or not configured or (existing.get("auth_config") or {}).get("auth_type") != "bearer":
        if (existing.get("auth_config") or {}).get("auth_type") != "bearer":
            _data(*call("PUT", f"/api/v1/mcp-services/{existing['id']}", {"auth_config": {"auth_type": "bearer"}},
                        token=token), "Mode d'authentification du service MCP")
        _data(*call("PUT", f"/api/v1/mcp-services/{existing['id']}/credentials", {"token": mcp_token(db, renew=renew)},
                    token=token), "Jeton du service MCP")
        report.done.append("Jeton du compte technique " + ("renouvelé" if renew else "enregistré") + " dans le moteur IA")
    db.commit()
    _ensure_approvals(existing["id"], token, report)
    if not existing.get("enabled", True):
        report.problems.append(f"Le serveur MCP « {MCP_NAME} » est désactivé dans le moteur IA (choix d'un "
                               "administrateur, laissé tel quel)")
    if not report.done:
        report.done.append(f"Serveur MCP « {MCP_NAME} » déjà déclaré, rien à changer")
    return report


def action_tool_names() -> list[str]:
    """Outils du serveur MCP qui enregistrent dans GSMS : approbation de la personne toujours requise."""
    return [tool.name for tool in TOOLS if tool.writes]


def _ensure_approvals(service_id: str, token: str, report: Report) -> None:
    """« Approbation toujours requise » sur chaque outil d'action ; seules les manquantes sont posées. Un échec est
    rapporté sans bloquer (le reste de la préparation et la session IA continuent)."""
    status, body = call("GET", f"/api/v1/mcp-services/{service_id}/tool-approvals", token=token)
    if not _ok(status, body):
        report.problems.append(f"Approbations des outils d'action non vérifiées : {message_of(body)} (HTTP {status})")
        return
    required = {row.get("tool_name") for row in body.get("data") or [] if row.get("require_approval")}
    missing = [name for name in action_tool_names() if name not in required]
    posed, refused = [], []
    for name in missing:
        status, body = call("PUT", f"/api/v1/mcp-services/{service_id}/tool-approvals/{name}",
                            {"require_approval": True}, token=token)
        if _ok(status, body):
            posed.append(name)
        else:
            refused.append(f"{name} : {message_of(body)} (HTTP {status})")
    if posed:
        report.done.append(f"Approbation de la personne exigée pour {len(posed)} outil(s) d'action : {', '.join(posed)}")
    if refused:
        report.problems.append(f"Approbation non posée pour {len(refused)} outil(s) d'action, par exemple « {refused[0]} » ; "
                               "à cocher dans les réglages du service MCP du moteur IA")


# ── Base de connaissances « Référentiel Qualiopi » ──────────────────────────────


def referential_sources(ref: Referential = QUALIOPI) -> list[tuple[str, str]]:
    """(titre, contenu) des textes officiels livrés : pour Qualiopi un document par indicateur et par version, pour
    les autres référentiels un document par fichier, titré par son en-tête (`titre:`)."""
    root = get_settings().referentials_dir / ref.folder
    if ref is QUALIOPI:
        paths = sorted(root.glob("v*/source/*.md"), key=lambda p: (p.parts[-3], p.name))
        return [(_title(path), path.read_text(encoding="utf-8")) for path in paths]
    return [(_front_title(path), path.read_text(encoding="utf-8")) for path in sorted(root.glob("source/*.md"))]


TITLE_MAX = 180
# Le moteur IA tronque les titres trop longs : un document se reconnaît au début de son titre, pas au titre entier.
TITLE_KEY = 150


def _short(title: str) -> str:
    """Titre de 180 caractères au plus, coupé sur un mot."""
    if len(title) <= TITLE_MAX:
        return title
    return title[:TITLE_MAX - 1].rsplit(" ", 1)[0].rstrip(" ,;:—-") + "…"


def _front_title(path: Path) -> str:
    """Titre de l'en-tête YAML (`titre: "…"`), sinon le nom du fichier."""
    for line in path.read_text(encoding="utf-8").splitlines()[1:12]:
        if line.startswith("titre:"):
            return _short(line.partition(":")[2].strip().strip('"'))
    return path.stem.partition("-")[2].replace("-", " ") or path.stem


def _title(path: Path) -> str:
    version = path.parts[-3]  # v9, v10
    number, _, slug = path.stem.partition("-")
    return f"Qualiopi {version} — indicateur {int(number)} — {slug.replace('-', ' ')}"


def _embedding_models(token: str) -> int | None:
    """Nombre de modèles d'embedding déclarés dans le moteur (None si la question n'a pas pu être posée)."""
    status, body = call("GET", "/api/v1/models", token=token)
    if not _ok(status, body):
        return None
    return sum(1 for m in body.get("data") or [] if m.get("type") == "Embedding")


def _default_model(token: str, kind: str) -> str | None:
    """Modèle par défaut du moteur pour un type (`Embedding`, `KnowledgeQA`), sinon le premier déclaré."""
    status, body = call("GET", "/api/v1/models", token=token)
    models = [m for m in (body.get("data") or [] if _ok(status, body) else []) if m.get("type") == kind and m.get("id")]
    chosen = next((m for m in models if m.get("is_default")), models[0] if models else None)
    return chosen["id"] if chosen else None


def _attach_models(kb: dict, token: str, report: Report) -> None:
    """Base créée avant tout modèle : on lui donne les modèles par défaut, en gardant son découpage."""
    name = kb.get("name") or KB_NAME
    embedding = _default_model(token, "Embedding")
    chat = get_settings().weknora_summary_model_id or _default_model(token, "KnowledgeQA")
    if not (embedding and chat):
        return
    chunking = kb.get("chunking_config") or {}
    splitting = {"chunkSize": chunking.get("chunk_size") or 0, "chunkOverlap": chunking.get("chunk_overlap") or 0,
                 "separators": chunking.get("separators") or []}
    status, body = call("PUT", f"/api/v1/initialization/config/{kb['id']}",
                        {"llmModelId": chat, "embeddingModelId": embedding, "documentSplitting": splitting}, token=token)
    if _ok(status, body):
        kb["embedding_model_id"] = embedding
        report.done.append(f"Modèles par défaut du moteur attribués à la base « {name} » ({embedding}, {chat})")
    else:
        report.problems.append(f"Modèles non attribués à la base « {name} » : {message_of(body)} (HTTP {status})")


def _all_knowledge(kb_id: str, token: str) -> list[dict]:
    rows, page = [], 1
    while True:
        status, body = call("GET", f"/api/v1/knowledge-bases/{kb_id}/knowledge?page={page}&page_size=200", token=token)
        batch = _data(status, body, "Liste des documents de la base") or []
        rows += batch
        if len(batch) < 200:
            return rows
        page += 1


def ensure_referential_kb(token: str, ref: Referential = QUALIOPI) -> Report:
    report = Report()
    embeddings = _embedding_models(token)
    if embeddings == 0:
        report.problems.append("Aucun modèle d'embedding n'est configuré dans le moteur IA : les documents ne peuvent "
                               "pas être indexés pour la recherche. À ajouter dans Paramètres › Modèles du moteur IA, "
                               "puis relancer « python -m app.cmd.cli ia-preparer ».")
    bases = _data(*call("GET", "/api/v1/knowledge-bases", token=token), "Liste des bases de connaissances") or []
    kb = next((b for b in bases if b.get("name") == ref.name), None)
    if kb is None:
        status, body = call("POST", "/api/v1/knowledge-bases", {"name": ref.name, "description": ref.description}, token=token)
        if not (_ok(status, body) and (body.get("data") or {}).get("id")):
            report.problems.append(f"Base « {ref.name} » non créée : {message_of(body)} (HTTP {status})")
            return report
        kb = body["data"]
        report.done.append(f"Base « {ref.name} » créée")
    else:
        report.done.append(f"Base « {ref.name} » déjà présente")

    # Modèles d'abord : un document déposé dans une base sans modèle d'embedding échoue (« model ID cannot be empty »).
    if not kb.get("embedding_model_id"):
        _attach_models(kb, token, report)
    existing = {(k.get("title") or "")[:TITLE_KEY]: k for k in _all_knowledge(kb["id"], token)}
    sources = referential_sources(ref)
    if not sources:
        report.problems.append(f"Aucun texte officiel trouvé dans referentials/{ref.folder}")
    created, refused = 0, []
    for title, content in sources:
        if title[:TITLE_KEY] in existing:
            continue
        status, body = call("POST", f"/api/v1/knowledge-bases/{kb['id']}/knowledge/manual",
                            {"title": title, "content": content, "status": "publish"}, token=token)
        if _ok(status, body):
            created += 1
            existing[title[:TITLE_KEY]] = body.get("data") or {"title": title}
        else:
            refused.append(f"{title} : {message_of(body)} (HTTP {status})")
    if created:
        report.done.append(f"{created} document(s) déposé(s) dans la base")
    already = len(sources) - created - len(refused)
    if already:
        report.done.append(f"{already} document(s) déjà présent(s), laissés tels quels")
    if refused:
        report.problems.append(f"{len(refused)} document(s) refusé(s) par le moteur IA, par exemple « {refused[0]} »")
    if not kb.get("embedding_model_id"):
        report.problems.append(f"La base « {ref.name} » n'a pas de modèle d'embedding : à choisir dans ses réglages "
                               "du moteur IA ; les documents seront alors réindexés au prochain « ia-preparer »")
    failed = [k for k in existing.values() if k.get("parse_status") == "failed" and k.get("id")]
    if failed and kb.get("embedding_model_id"):
        # Le modèle manquait lors du dépôt : on relance l'indexation des documents en échec.
        retried = [k for k in failed if _ok(*call("POST", f"/api/v1/knowledge/{k['id']}/reparse", {}, token=token))]
        if retried:
            report.done.append(f"{len(retried)} document(s) en échec renvoyé(s) à l'indexation")
        failed = [k for k in failed if k not in retried]
    if failed:
        msg = failed[0].get("error_message") or "sans motif"
        report.problems.append(f"{len(failed)} document(s) en échec d'indexation dans le moteur IA (ex. : {msg})")
    if ref is QUALIOPI:
        report.done.append("Aucun guide de lecture n'est livré dans le dépôt : seuls les textes officiels sont déposés")
    return report
