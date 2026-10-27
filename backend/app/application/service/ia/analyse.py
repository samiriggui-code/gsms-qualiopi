"""Analyse d'un indicateur : contrat versionné entre le moteur Qualiopi et le moteur IA (WeKnora).

Contrat `gsms.ia.analyse-indicateur/2` (la version 1 n'avait pas l'analyse par le modèle). GSMS orchestre, dans cet ordre :

1. **moteur Qualiopi** : la chaîne de l'indicateur (`indicator_chain`), recopiée telle quelle dans `moteur`. Son
   état de préparation reste la seule référence ; rien ne le recalcule ni ne le modifie ici ;
2. **recherche documentaire** : recherche hybride du moteur IA dans deux bases, sur des documents autorisés fixés
   côté serveur, jamais par l'appelant :
   - « Référentiel Qualiopi » : les textes officiels de cet indicateur dans la version du référentiel en vigueur ;
   - « Documents de l'organisme » : les documents versés par GSMS **et encore éligibles dans GSMS** au moment de la
     demande (une pièce retirée ou remplacée dans GSMS est refusée, même si l'index ne l'a pas encore effacée).
   Chaque passage rendu est relu : un passage d'un document hors de ces listes est rejeté et compté, jamais affiché ;
   un résumé rédigé par le modèle à l'indexation n'est pas une citation : il est écarté (compté à part) ;
3. **trace** (`qualite.ia_analyse`) : identifiant de corrélation, version du référentiel, documents consultés, durée,
   résultat technique. Ni le texte des documents ni la question (seulement son empreinte).

4. **analyse par le modèle**, seulement sur demande (`analyse_ia`) : observations (contradiction, manque, incomplet,
   constat) et propositions d'action sur les seuls passages vérifiés, validées par `observations.py` (forme, citations
   vers des passages fournis). Les observations sont des propositions de l'IA ; les propositions d'action sont
   enregistrées (`qualite.ia_proposition`) et attendent une décision humaine.

Ce qui n'est pas fait est dit (`controles_non_executes`). Un passage retrouvé dans un document de l'organisme n'est pas
une preuve validée : seul l'état du moteur dit ce qui est démontrable.
"""

from __future__ import annotations

import hashlib
import time

from sqlalchemy.orm import Session

from app.application.service.ia.documents import KB_NAME as DOCS_KB_NAME
from app.application.service.ia.documents import eligible_documents
from app.application.service.ia.espace import KB_NAME, _all_knowledge, _data
from app.application.service.ia.observations import analyse as model_analyse
from app.application.service.ia.session import open_service_session
from app.application.service.ia.weknora import IAUnavailable, call
from app.application.service.qualiopi.chain import indicator_chain
from app.application.service.qualiopi.referential.importer import active_version
from app.types.auth import User
from app.types.ia import IAAnalysis, IAProposal

CONTRACT = "gsms.ia.analyse-indicateur/2"
MAX_PASSAGES = 10
MAX_QUESTION = 500
EXCERPT = 1200  # caractères d'un passage rendus au plus
# Passages tirés du texte même du document. Les autres types de passage du moteur IA (résumé, légende d'image, résumé de
# tableau, entités) sont rédigés par un modèle à l'indexation : ce ne sont pas des citations, ils sont écartés.
SOURCE_CHUNKS = ("text", "parent_text")

NOT_ASKED = {"controle": "observations du modèle de langage",
             "motif": "non demandées (option analyse_ia) : aucune observation, contradiction ni proposition n'est générée"}


def _title_prefix(version: str, number: int) -> str:
    """Début du titre des textes officiels déposés par `ia-preparer` (`espace._title`), ex. « Qualiopi v9 — indicateur 31 — »."""
    return f"Qualiopi {version.lower()} — indicateur {number} — "


def _query(chain: dict, question: str | None) -> str:
    if question:
        return question
    ind = chain["indicateur"]
    statement = next((x["texte"] for x in ind["exigences"] if x["texte"]), "")
    return f"{ind['titre']}\n{statement}"[:MAX_QUESTION]


def _reference(row: dict, allowed: dict[str, dict]) -> dict:
    content, doc = row.get("content") or "", allowed[row["knowledge_id"]]
    return {
        "base": doc["base"], "passage_id": row["id"], "document_id": row["knowledge_id"], "titre": doc["titre"],
        "gsms_document_id": doc.get("gsms_document_id"), "version_document": doc.get("version"),
        "position": {"debut": row.get("start_at"), "fin": row.get("end_at"), "rang": row.get("chunk_index")},
        "extrait": content[:EXCERPT], "extrait_tronque": len(content) > EXCERPT, "score": row.get("score"),
    }


def _hybrid(kb_id: str, allowed: dict[str, dict], query: str, limit: int, token: str) -> list:
    if not allowed:
        return []
    payload = {"query_text": query, "match_count": limit, "knowledge_ids": sorted(allowed), "skip_context_enrichment": True}
    rows = _data(*call("POST", f"/api/v1/knowledge-bases/{kb_id}/hybrid-search", payload, token=token, timeout=60),
                 "Recherche documentaire")
    return rows if isinstance(rows, list) else []


def _search(db: Session, version: str, number: int, query: str, limit: int) -> dict:
    """Recherche dans les documents autorisés des deux bases. Lève IAUnavailable si le moteur IA ne répond pas."""
    token = open_service_session()["token"]
    bases = {b.get("name"): b for b in _data(*call("GET", "/api/v1/knowledge-bases", token=token),
                                             "Liste des bases de connaissances") or []}
    allowed: dict[str, dict] = {}
    rows: list = []
    why = []
    kb = bases.get(KB_NAME)
    if kb is None:
        why.append(f"base « {KB_NAME} » absente (lancer ia-preparer)")
    else:
        prefix = _title_prefix(version, number)
        official = {k["id"]: {"base": "referentiel", "titre": k["title"]} for k in _all_knowledge(kb["id"], token)
                    if (k.get("title") or "").startswith(prefix) and k.get("parse_status") == "completed" and k.get("id")}
        if not official:
            why.append(f"aucun texte officiel indexé pour l'indicateur {number} ({version})")
        allowed |= official
        rows += _hybrid(kb["id"], official, query, limit, token)
    docs_kb = bases.get(DOCS_KB_NAME)
    if docs_kb is None:
        why.append(f"base « {DOCS_KB_NAME} » absente (lancer ia-preparer)")
    else:
        current = {d.id: d for d in eligible_documents(db)}
        org = {}
        for k in _all_knowledge(docs_kb["id"], token):
            meta = k.get("metadata") if isinstance(k.get("metadata"), dict) else {}
            doc = current.get(meta.get("gsms_document_id") or "")
            if doc and meta.get("gsms_sha256") == doc.sha256 and k.get("parse_status") == "completed" and k.get("id"):
                org[k["id"]] = {"base": "organisme", "titre": doc.title, "gsms_document_id": doc.id,
                                "version": str(doc.version)}
        if not org:
            why.append("aucun document de l'organisme indexé et autorisé")
        allowed |= org
        rows += _hybrid(docs_kb["id"], org, query, limit, token)
    model = (kb or docs_kb or {}).get("embedding_model_id")
    return {"allowed": allowed, "rows": rows, "model": model, "why": " ; ".join(why) or None}


def analyse_indicator(db: Session, user: User, number: int, question: str | None = None,
                      max_passages: int = 5, analyse_ia: bool = False) -> dict:
    started = time.monotonic()
    version = active_version(db)
    chain = indicator_chain(db, version, number, user)  # lève NotFoundError pour un numéro inconnu
    question = (question or "").strip() or None
    trace = IAAnalysis(contract=CONTRACT, user_id=user.id, indicator_number=number, referential_version=version.version,
                       engine_status=chain["etat"], reference_status="ERREUR_TECHNIQUE",
                       question_sha256=hashlib.sha256(question.encode()).hexdigest() if question else None,
                       duration_ms=0)
    references, errors, rejected, generated, reason = [], [], 0, 0, None
    try:
        found = _search(db, version.version, number, _query(chain, question), max_passages)
        reason = found["why"]
        trace.allowed_documents, trace.embedding_model = sorted(found["allowed"]), found["model"]
        for row in found["rows"]:
            ok = (isinstance(row, dict) and isinstance(row.get("id"), str) and isinstance(row.get("content"), str)
                  and row.get("knowledge_id") in found["allowed"])
            if ok and (row.get("chunk_type") or "text") not in SOURCE_CHUNKS:
                generated += 1
            elif ok:
                references.append(_reference(row, found["allowed"]))
            else:
                rejected += 1
        references = sorted(references, key=lambda r: -(r["score"] or 0))[:max_passages]
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
    db.add(trace)
    db.flush()  # identifiant de corrélation, auquel les propositions se rattachent

    observations, proposals, not_run = [], [], [NOT_ASKED]
    if analyse_ia and not references:
        not_run = [{"controle": "observations du modèle de langage", "motif": "aucun passage vérifié à analyser"}]
    elif analyse_ia:
        try:
            outcome = model_analyse(open_service_session()["token"], chain, references)
        except IAUnavailable as e:
            outcome = None
            errors.append({"etape": "analyse par le modèle", "message": str(e)})
            not_run = [{"controle": "observations du modèle de langage", "motif": f"échec : {e}"}]
        if outcome is not None:
            trace.generation_model = outcome.model
            trace.observations_kept = len(outcome.observations) + len(outcome.proposals)
            trace.observations_rejected = outcome.rejected
            not_run = []
            if outcome.error:
                errors.append({"etape": "analyse par le modèle", "message": outcome.error})
                not_run = [{"controle": "observations du modèle de langage", "motif": outcome.error}]
            if outcome.rejected:
                errors.append({"etape": "analyse par le modèle", "message": f"{outcome.rejected} observation(s) ou "
                               "proposition(s) rejetée(s) : sans citation, ou citant un passage non fourni"})
            observations = outcome.observations
            for item in outcome.proposals:
                row = IAProposal(analysis_id=trace.id, indicator_number=number, action=item["action"],
                                 justification=item["justification"], passages=item["passages"])
                db.add(row)
                db.flush()
                proposals.append({"id": row.id, **item, "statut": row.status})
            if proposals:
                trace.validation_status = "EN_ATTENTE"
    trace.duration_ms = int((time.monotonic() - started) * 1000)
    db.commit()
    return {
        "contrat": CONTRACT,
        "correlation_id": trace.id,
        "cree_le": trace.created_at.isoformat(),
        "perimetre": {"indicateur": number, "referentiel": version.version, "documents_autorises": trace.allowed_documents},
        "moteur": chain,
        "recherche": {"statut": trace.reference_status, "motif": reason, "modele_embedding": trace.embedding_model,
                      "references": references, "passages_rejetes": rejected,
                      "resumes_generes_ecartes": generated},
        "observations_ia": observations,
        "propositions": proposals,
        "controles_non_executes": not_run,
        "erreurs": errors,
        "validation_humaine": {"statut": trace.validation_status},
        "duree_ms": trace.duration_ms,
        "avertissement": "L'état de préparation est celui du moteur Qualiopi ; les passages sont des textes retrouvés "
                         "par la recherche, pas un constat ; les observations et propositions de l'IA ne sont pas des "
                         "décisions. Seul l'organisme certificateur décide de la conformité.",
    }
