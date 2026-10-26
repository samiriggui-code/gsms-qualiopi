"""Analyse d'un indicateur : contrat versionné entre le moteur Qualiopi et le moteur IA (WeKnora).

Contrat `gsms.ia.analyse-indicateur/1`. GSMS orchestre, dans cet ordre :

1. **moteur Qualiopi** : la chaîne de l'indicateur (`indicator_chain`), recopiée telle quelle dans `moteur`. Son
   état de préparation reste la seule référence ; rien ne le recalcule ni ne le modifie ici ;
2. **recherche documentaire** : recherche hybride du moteur IA, limitée par GSMS aux textes officiels de cet
   indicateur dans la version du référentiel en vigueur (la liste des documents autorisés est fixée côté serveur,
   jamais par l'appelant). Chaque passage rendu est relu : un passage d'un document hors de cette liste est rejeté
   et compté, jamais affiché ;
3. **trace** (`qualite.ia_analyse`) : identifiant de corrélation, version du référentiel, documents consultés, durée,
   résultat technique. Ni le texte des documents ni la question (seulement son empreinte).

Ce que cette version ne fait pas, et dit ne pas faire (`controles_non_executes`) : aucune génération par un modèle
de langage (donc aucune observation ni proposition d'action), aucune recherche dans les documents propres de
l'organisme (la base « Documents de l'organisme » n'existe pas encore).
"""

from __future__ import annotations

import hashlib
import time

from sqlalchemy.orm import Session

from app.application.service.ia.espace import KB_NAME, _all_knowledge, _data
from app.application.service.ia.session import open_service_session
from app.application.service.ia.weknora import IAUnavailable, call
from app.application.service.qualiopi.chain import indicator_chain
from app.application.service.qualiopi.referential.importer import active_version
from app.types.auth import User
from app.types.ia import IAAnalysis

CONTRACT = "gsms.ia.analyse-indicateur/1"
MAX_PASSAGES = 10
MAX_QUESTION = 500
EXCERPT = 1200  # caractères d'un passage rendus au plus

NOT_RUN = [
    {"controle": "observations du modèle de langage",
     "motif": "non branchées dans cette version du contrat : aucune observation ni proposition n'est générée"},
    {"controle": "documents propres de l'organisme",
     "motif": "la base « Documents de l'organisme » n'existe pas encore : seuls les textes officiels sont cherchés"},
]


def _title_prefix(version: str, number: int) -> str:
    """Début du titre des textes officiels déposés par `ia-preparer` (`espace._title`), ex. « Qualiopi v9 — indicateur 31 — »."""
    return f"Qualiopi {version.lower()} — indicateur {number} — "


def _query(chain: dict, question: str | None) -> str:
    if question:
        return question
    ind = chain["indicateur"]
    statement = next((x["texte"] for x in ind["exigences"] if x["texte"]), "")
    return f"{ind['titre']}\n{statement}"[:MAX_QUESTION]


def _reference(row: dict, titles: dict[str, str]) -> dict:
    content = row.get("content") or ""
    return {
        "passage_id": row["id"], "document_id": row["knowledge_id"], "titre": titles[row["knowledge_id"]],
        "version_document": (row.get("metadata") or {}).get("version"),
        "position": {"debut": row.get("start_at"), "fin": row.get("end_at"), "rang": row.get("chunk_index")},
        "extrait": content[:EXCERPT], "extrait_tronque": len(content) > EXCERPT, "score": row.get("score"),
    }


def _search(version: str, number: int, query: str, limit: int) -> dict:
    """Recherche dans les seuls textes officiels de l'indicateur. Lève IAUnavailable si le moteur IA ne répond pas."""
    token = open_service_session()["token"]
    bases = _data(*call("GET", "/api/v1/knowledge-bases", token=token), "Liste des bases de connaissances") or []
    kb = next((b for b in bases if b.get("name") == KB_NAME), None)
    if kb is None:
        return {"allowed": {}, "rows": [], "model": None, "why": f"base « {KB_NAME} » absente (lancer ia-preparer)"}
    prefix = _title_prefix(version, number)
    allowed = {k["id"]: k["title"] for k in _all_knowledge(kb["id"], token)
               if (k.get("title") or "").startswith(prefix) and k.get("parse_status") == "completed" and k.get("id")}
    if not allowed:
        return {"allowed": {}, "rows": [], "model": kb.get("embedding_model_id"),
                "why": f"aucun texte officiel indexé pour l'indicateur {number} ({version})"}
    payload = {"query_text": query, "match_count": limit, "knowledge_ids": sorted(allowed),
               "skip_context_enrichment": True}
    rows = _data(*call("POST", f"/api/v1/knowledge-bases/{kb['id']}/hybrid-search", payload, token=token, timeout=60),
                 "Recherche documentaire")
    return {"allowed": allowed, "rows": rows if isinstance(rows, list) else [], "model": kb.get("embedding_model_id"),
            "why": None}


def analyse_indicator(db: Session, user: User, number: int, question: str | None = None,
                      max_passages: int = 5) -> dict:
    started = time.monotonic()
    version = active_version(db)
    chain = indicator_chain(db, version, number, user)  # lève NotFoundError pour un numéro inconnu
    question = (question or "").strip() or None
    trace = IAAnalysis(contract=CONTRACT, user_id=user.id, indicator_number=number, referential_version=version.version,
                       engine_status=chain["etat"], reference_status="ERREUR_TECHNIQUE",
                       question_sha256=hashlib.sha256(question.encode()).hexdigest() if question else None,
                       duration_ms=0)
    references, errors, rejected, reason = [], [], 0, None
    try:
        found = _search(version.version, number, _query(chain, question), max_passages)
        reason = found["why"]
        trace.allowed_documents, trace.embedding_model = sorted(found["allowed"]), found["model"]
        for row in found["rows"]:
            ok = (isinstance(row, dict) and isinstance(row.get("id"), str) and isinstance(row.get("content"), str)
                  and row.get("knowledge_id") in found["allowed"])
            if ok:
                references.append(_reference(row, found["allowed"]))
            else:
                rejected += 1
        references = references[:max_passages]
        trace.reference_status = "REFERENCES_RETROUVEES" if references else "AUCUNE_REFERENCE"
    except IAUnavailable as e:
        errors.append({"etape": "recherche documentaire", "message": str(e)})
        trace.error = str(e)[:2000]
    if rejected:
        errors.append({"etape": "recherche documentaire",
                       "message": f"{rejected} passage(s) rejeté(s) : document hors du périmètre autorisé ou réponse mal formée"})
    trace.chunk_ids = [r["passage_id"] for r in references]
    trace.consulted_documents = sorted({r["document_id"] for r in references})
    trace.rejected_references = rejected
    trace.duration_ms = int((time.monotonic() - started) * 1000)
    db.add(trace)
    db.commit()
    return {
        "contrat": CONTRACT,
        "correlation_id": trace.id,
        "cree_le": trace.created_at.isoformat(),
        "perimetre": {"indicateur": number, "referentiel": version.version, "documents_autorises": trace.allowed_documents},
        "moteur": chain,
        "recherche": {"statut": trace.reference_status, "motif": reason, "modele_embedding": trace.embedding_model,
                      "references": references, "passages_rejetes": rejected},
        "observations_ia": [],
        "propositions": [],
        "controles_non_executes": NOT_RUN,
        "erreurs": errors,
        "validation_humaine": {"statut": trace.validation_status},
        "duree_ms": trace.duration_ms,
        "avertissement": "L'état de préparation est celui du moteur Qualiopi ; les passages sont des textes officiels "
                         "retrouvés par la recherche, pas un constat. Seul l'organisme certificateur décide de la conformité.",
    }
