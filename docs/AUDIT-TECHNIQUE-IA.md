# Audit technique : moteur Qualiopi (Python) et moteur IA (WeKnora)

État au 26/10/2026, branche `refonte-front`. Ce document complète `AUDIT-WEKNORA-QUALIOPI.md` (besoins
fonctionnels). Il distingue ce qui est **vérifié** (code lu, commande exécutée, test passé) de ce qui ne l'est pas.

## 1. Architecture réelle

Une instance GSMS sert **un seul organisme** (CDC §2). Il n'y a pas de multi-organisme dans une base : l'isolation
entre organismes est celle des instances (une base `gsms` et un espace WeKnora par instance).

| Couche | Dossier | Technologie | Rôle |
|---|---|---|---|
| Back-office | `app/` | Vue 3 + TDesign (écrans WeKnora adaptés) | affiche les décisions de l'API |
| API et moteur Qualiopi | `backend/` | FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16 | règles métier, preuves, contrôles, écarts, actions |
| Worker | `backend/app/cmd/worker.py` | même code | lit l'outbox, réévalue le moteur, relances |
| Moteur IA | `ia/moteur/` (rapatrié le 26/10/2026) | WeKnora 0.8.3 allégé (Go), docreader (Python, gRPC) | bases de connaissances, recherche hybride, chat, agents |
| Données IA | conteneurs `ia-postgres` (ParadeDB pg17), `ia-redis` | pgvector + BM25, files asynq | index, embeddings, conversations |
| Modèles | `ia/config/builtin_models*.yaml` | Ollama local en dev ; production non choisie | génération, embeddings |

```
Navigateur ──/app/──► back-office (Vue)
   │  /api/v1 (jeton GSMS)                        /ia/* (jeton WeKnora « navigateur », contributeur)
   ▼                                                ▼
API GSMS (FastAPI) ──REST, compte de service──► WeKnora ia-app (Go) ──► ia-postgres (vecteurs, BM25)
   │  ▲                                             │   └──────────────► ia-docreader (lecture PDF/DOCX)
   │  └──── MCP POST /api/v1/mcp (jeton « mcp », ◄──┘   └──────────────► Ollama (dev) / fournisseur (prod)
   │         compte technique assistant_ia, réseau interne seulement)
   ▼
PostgreSQL gsms (métier, preuves, contrôles, traces d'analyse)      backend/var/documents (pièces originales)
```

## 2. Flux et interfaces

| De → vers | Interface | Authentification | Code |
|---|---|---|---|
| Front → API | REST `/api/v1` | jeton GSMS, permissions par route | `backend/app/handler/*` |
| Front → WeKnora | REST `/ia/api/v1` | jeton du compte WeKnora **navigateur** (contributeur, sans renouvellement) remis par `POST /api/v1/ia/session` | `service/ia/session.py` |
| API → WeKnora | REST (comptes, membres, MCP, base, agents, recherche) | compte WeKnora **de service** (propriétaire), jamais remis au navigateur | `service/ia/{weknora,espace,assistants,analyse}.py` |
| WeKnora → API | MCP Streamable HTTP, 14 outils en lecture | jeton « mcp » du compte technique `assistant_ia` (`quality.read`, `sessions.read`), refusé s'il passe par un proxy | `handler/mcp.py`, `handler/mcp_outils.py` |
| API → WeKnora (nouveau) | contrat `gsms.ia.analyse-indicateur/1` | compte de service, documents autorisés fixés par GSMS | `service/ia/analyse.py` |

WeKnora ne lit jamais la base `gsms` : il passe par le MCP, qui reprend les fonctions des routes HTTP (mêmes
politiques). La base `weknora` ne contient que des textes officiels (65 documents) : aucune pièce nominative.

## 3. Moteur Qualiopi : déterministe et humain

- **Déterministe** : détecteurs de preuves (`evidence/detectors`), réconciliation, contrôles versionnés
  (`control_definition`, `control_result`, historique par run), état de préparation par indicateur
  (`NON_APPLICABLE`, `NON_EVALUE`, `NON_EVALUABLE`, `PREUVES_INSUFFISANTES`, `A_RISQUE`, `DEMONTRABLE`, jamais
  « conforme »), écarts, échéancier. Déclenché par événements (outbox → worker) ou par « tout réévaluer ».
- **Humain** : validation des preuves (`evidence.validate`), grilles de relecture, revues d'indicateur
  (`NON_EVALUE` = revue humaine seulement, `revue_humaine` signalée par contrôle), actions correctives.
- **Référentiel versionné** : V9 (8 janvier 2024) et V10 (décret n° 2026-728, en vigueur le 1er novembre 2026),
  bascule automatique `activate_due` ; sources dans `backend/referentials/qualiopi/v*/`.
- **Tests** : 364 tests pytest sur un vrai PostgreSQL (nombre au 26/10/2026, avant ce chantier).

## 4. WeKnora installé

- **Version** : 0.8.3 (dépôt amont `Tencent/WeKnora`, commit `e1f9a61` du 24/10/2026 comme référence locale).
- **Modifications locales** (comparaison avec l'amont) : 157 fichiers modifiés ; retirés : moteurs vectoriels
  externes (Milvus, Qdrant, Weaviate, Elasticsearch, OpenSearch, Doris, Tencent VectorDB), stockages cloud
  (COS, OSS, OBS, KS3, TOS), connecteurs (Feishu, DingTalk, Yuque, IMA), messageries (WeChat, WeCom, QQ…),
  fournisseurs de recherche web et de modèles chinois, WeKnora Cloud. Le journal d'audit WeKnora (`audit_logs`)
  est conservé (seul l'adaptateur OpenSearch a disparu, avec OpenSearch).
- **Ingestion** : dépôt `knowledge/{file,url,manual}` → tâche asynq → docreader (Markdown) → découpage
  (`chunk_size` 512, chevauchement 50, `ia/config/config.yaml`) → embeddings → ParadeDB.
- **Recherche** : hybride (vecteurs + BM25), filtrable par documents (`knowledge_ids`), reranking possible
  (aucun modèle de reranking déclaré : inactif). Chaque passage rend `id`, `knowledge_id`, titre, `start_at`/`end_at`,
  `metadata.version` : de quoi citer une source vérifiable.
- **Agents** : 4 agents d'origine + 3 agents GSMS (`assistants.py`), tous `read_only`, recherche web coupée,
  aucune compétence (skills) ; le serveur MCP GSMS est le seul outil externe.
- **Authentification** : comptes WeKnora, inscription fermée (`DISABLE_REGISTRATION=true`), rôles d'espace.

## 5. Vérifié (26/10/2026)

| Fonction | Preuve |
|---|---|
| Images construites depuis `ia/moteur` | `docker compose build ia-app ia-docreader` : succès (`gsms-ia-app:local`, `gsms-ia-docreader:local`) ; les conteneurs en service tournent encore sur les anciennes images, à basculer au prochain redémarrage de la pile |
| Modèles déclarés et actifs en dev | `GET /api/v1/models` : 1 génération, 1 embedding, `source: local` |
| Base « Référentiel Qualiopi » indexée | 65 documents `completed`, aucun en échec |
| Serveur MCP déclaré et activé | `GET /api/v1/mcp-services` : `http://api:8000/api/v1/mcp`, transport `http-streamable` |
| 3 assistants GSMS présents | `GET /api/v1/agents` |
| Recherche pertinente | jeu de 10 questions à indicateur connu : **rappel@5 = 9/10** (l'échec, indicateur 2, vient d'une question qui mélangeait les indicateurs 2 et 3) |
| Latence de recherche | moyenne **5,6 s**, maximum 9,3 s (embeddings sur processeur, 4 cœurs, sans carte graphique) |
| Tests IA et MCP | 34 tests, puis contrat d'analyse : voir §9 |

## 6. Partiel ou non vérifié

- **Génération (chat, agents)** : non mesurée. Le modèle de dev est petit et tourne sur processeur ; il sert à vérifier
  le circuit, pas la qualité des réponses.
- **Production** : aucun fournisseur choisi. Le fichier Mistral (`builtin_models.mistral.yaml.example`) n'a jamais été
  essayé.
- **Base « Documents de l'organisme »** : n'existe pas. L'analyse de documents propres (preuves, programmes) n'est donc
  pas possible aujourd'hui ; le test pilote de la mission (documents contradictoires, périmés, piégés) demande cette
  base et un parcours de dépôt vers WeKnora, qui n'existent pas encore.

## 7. Risques

| # | Risque | Gravité | État |
|---|---|---|---|
| R1 | Un rôle personnalisé avec `ia.use` sans `quality.read` lisait l'état Qualiopi par l'assistant (compte technique) : contournement des droits GSMS | Élevée | **Corrigé** (refus 403, test) |
| R2 | Un seul compte WeKnora « navigateur » pour tous les utilisateurs GSMS : chacun voit les conversations des autres dans le moteur IA | Élevée (confidentialité interne) | Ouvert : demande un compte WeKnora par utilisateur GSMS (ou un filtrage par utilisateur dans le fork) |
| R3 | Le code du moteur IA n'était pas versionné (`global-it-ss-template` hors git) | Élevée | **Corrigé** (`ia/moteur`, commit `53f8a52`) |
| R4 | Ollama de dev s'arrête au redémarrage (politique « no ») : recherche et chat en panne sans message clair | Moyenne (dev) | Ouvert : conteneur hors de ce dépôt (`gitss-ollama`) |
| R5 | Sandbox Docker activée en dev (socket Docker = root sur la machine) | Moyenne (dev) | Accepté en dev, coupé en production (`ia/.env.example`) |
| R6 | Jeton MCP sans expiration | Faible | Accepté : réseau interne seulement, refus derrière un proxy, révoqué par désactivation ou `renew` |
| R7 | Injection d'instructions dans un document | Moyenne | Atténuée : agents en lecture seule, aucun outil d'écriture, recherche web et skills coupées ; le contrat d'analyse ne génère rien et rend les passages comme données |
| R8 | `match_count` dépassé par l'enrichissement de contexte (8 à 13 passages pour 5 demandés) | Faible | Contourné dans le contrat (`skip_context_enrichment`) |
| R9 | Données vers un fournisseur distant | À trancher | Aucun fournisseur distant configuré ; à décider avant la production (UE ou local) |

## 8. À préserver

Moteur Qualiopi seul juge de l'état de préparation ; MCP en lecture seule qui reprend les routes ; compte de service
côté serveur et compte navigateur contributeur sans renouvellement ; jeton « mcp » refusé derrière un proxy ;
`/api/v1/mcp` non publié par Caddy ; aucune pièce nominative dans les bases de connaissances ; inscription WeKnora
fermée ; sandbox coupée en production.

## 9. Modifications de ce chantier

1. **Moteur IA rapatrié** dans `ia/moteur` ; `docker-compose.yml` construit `ia-app` et `ia-docreader` depuis là.
2. **R1 corrigé** : `POST /api/v1/ia/session` exige toutes les permissions du compte technique
   (`backend/app/handler/ia.py`, test `test_session_ia_refusee_sans_les_droits_du_compte_technique`).
3. **Contrat `gsms.ia.analyse-indicateur/1`** (`backend/app/application/service/ia/analyse.py`) :
   - `POST /api/v1/ia/analyses` (`ia.use` + `quality.read`) : `{indicateur, question?, max_passages?}`, tout autre
     champ refusé (422) ; l'organisme, la version du référentiel et les documents autorisés sont fixés par GSMS ;
   - réponse : `moteur` (chaîne de l'indicateur, identique à `GET /qualiopi/indicateurs/{n}`), `recherche`
     (statut `REFERENCES_RETROUVEES` / `AUCUNE_REFERENCE` / `ERREUR_TECHNIQUE`, références avec passage, document,
     version, position, extrait), `observations_ia` et `propositions` (vides dans cette version),
     `controles_non_executes`, `erreurs`, `validation_humaine` ;
   - tout passage d'un document hors périmètre ou mal formé est **rejeté et compté** ;
   - moteur IA injoignable : l'état du moteur Qualiopi reste rendu, la recherche passe en `ERREUR_TECHNIQUE` ;
   - `GET /api/v1/ia/analyses` (`journal.read`) : traces.
4. **Traces** : table `qualite.ia_analyse` (migration `0028`, création seule) : corrélation, utilisateur, indicateur,
   version, état du moteur, documents autorisés et consultés, passages, rejets, modèle d'embedding, durée, erreur,
   validation. Ni la question (empreinte SHA-256 seulement) ni le texte des documents.

## 10. Configuration (sans secrets)

- API (`.env`) : `WEKNORA_URL`, `WEKNORA_SERVICE_EMAIL`, `WEKNORA_SERVICE_PASSWORD`, `WEKNORA_SERVICE_NAME`,
  `WEKNORA_BROWSER_EMAIL` (facultatif), `IA_MCP_URL`, `IA_COMPTE_TECHNIQUE_EMAIL`.
- Moteur IA (`ia/.env`, modèle `ia/.env.example`) : base, Redis, `JWT_SECRET`, `SYSTEM_AES_KEY`,
  `SYSTEM_SIGNING_KEY`, `DISABLE_REGISTRATION=true`, `WEKNORA_SANDBOX_DOCKER_ENABLED=false`,
  `BUILTIN_MODELS_CONFIG` (fichier de modèles), clés des fournisseurs.
- Compose : `SSRF_WHITELIST_EXTRA=api` (le moteur IA doit joindre le MCP de l'API).

## 11. Déploiement et retour arrière

- Construire : `docker compose build ia-app ia-docreader` ; migrer l'API (`alembic upgrade head`, automatique au
  démarrage de l'API) ; relancer `api` puis `ia-app`.
- Retour arrière du contrat : `alembic downgrade 0027` (supprime seulement la table des traces) et revenir au commit
  précédent. Retour arrière du moteur : les anciennes images `gitss-app:local` et `gitss-docreader:local` restent sur la
  machine ; remettre leur nom dans `docker-compose.yml`.

## 12. Plan, par priorité

1. **P0** : choisir le fournisseur de production (local ou UE) et mesurer la génération sur le même jeu de questions.
2. **P0** : R2, un compte WeKnora par utilisateur GSMS (ou isolement des conversations dans le fork).
3. **P1** : base « Documents de l'organisme » alimentée par GSMS au dépôt d'un document (métadonnées : document, version,
   type), suppression synchronisée ; c'est le préalable au test pilote documentaire.
4. **P1** : observations du modèle dans le contrat (version 2) : réponse JSON validée par schéma, chaque citation
   rattachée à un passage réellement retrouvé (sinon rejetée), statut « proposition IA » jusqu'à validation humaine.
5. **P1** : routage local / distant explicite (politique par type de tâche et classe de données), seulement quand un
   modèle distant existe.
6. **P2** : écran « Analyse » dans la fiche indicateur (moteur, références, IA identifiée comme telle, validation).
