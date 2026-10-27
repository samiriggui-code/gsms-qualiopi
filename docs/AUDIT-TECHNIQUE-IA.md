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
- **Authentification** : comptes WeKnora, inscription libre fermée (`registration_mode: invite_register`, comptes créés par invitation de l'espace), rôles d'espace.

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

- **Génération (agents)** : mesurée le 27/10/2026, **inutilisable avec le modèle local de dev sur cette machine**. Une
  question à « Préparation d'audit » envoie environ 7 500 jetons (consignes et 14 outils) ; Ollama, réglé à 4 096 jetons
  de contexte, **tronque le début de la requête, donc les consignes** (dont celle contre l'injection d'instructions), puis
  ne produit rien en 2 minutes sur 4 cœurs sans carte graphique : le moteur abandonne. Le test d'injection au niveau de
  l'assistant n'a donc pas pu conclure. Il faut un modèle à plus grand contexte (local sur une machine dédiée, ou
  fournisseur) avant toute mise en service des assistants ; la troncature des consignes est un risque de sécurité.
- **Production** : aucun fournisseur choisi. Le fichier Mistral (`builtin_models.mistral.yaml.example`) n'a jamais été
  essayé.
- **Absence de preuve** : la recherche hybride rend toujours ses meilleurs passages, avec des scores normalisés (1,0 pour
  le premier) même quand rien n'est pertinent (pilote, indicateur 26 : la procédure « violences » sort en tête). Le
  contrat ne peut donc pas conclure « aucune preuve » à partir des scores ; il faudra un jugement (modèle ou humain).
- **Contradictions** : les deux documents contradictoires du pilote sont bien retrouvés côte à côte, mais rien ne
  signale la contradiction (déclaré dans `controles_non_executes`).

## 6 bis. Test pilote de bout en bout (indicateur 31, 27/10/2026)

Script rejouable (hors dépôt, sur la pile de dev), passant par les routes réelles : dépôt
`POST /dossiers/{sujet}/{id}/pieces/{pièce}`, synchronisation vers le moteur IA, indexation, `POST /ia/analyses`.
Documents fictifs marqués « PILOTE » : procédure réclamations v1 puis v2, règlement intérieur contradictoire (30 jours
contre 10), compte rendu incomplet, procédure piégée (consignes adressées à l'IA), CV de formateur (pièce interdite).
**24 vérifications sur 24 réussies** :

| Scénario | Résultat |
|---|---|
| Ancienne version | passe `REMPLACE` au dépôt de la v2, jamais versée ni citée |
| Pièce interdite (CV de formateur, nom et téléphone) | exclue par la liste blanche, jamais dans l'index |
| Preuve pertinente | v2 retrouvée avec le texte officiel de l'indicateur 31 (score 0,99) |
| Documents contradictoires | les deux retrouvés ; contradiction non signalée automatiquement |
| Document incomplet | indexé et retrouvé ; son caractère incomplet n'est pas jugé |
| Document piégé | rendu comme donnée (extrait), aucun effet : le contrat ne génère rien et ne décide rien |
| Preuve manquante (indicateur 26) | la recherche rend quand même des passages (voir §6) |
| Moteur Qualiopi | réponse identique à `GET /qualiopi/indicateurs/31` |
| Traces | enregistrées sans question ni texte |

Trouvé pendant le pilote et corrigé : le moteur IA indexe aussi des **résumés rédigés par le modèle** (`# Summary`) qui
remontaient comme des passages ; ils sont désormais écartés des citations (`resumes_generes_ecartes`, 5 sur la question
du délai). Latence de l'analyse : 1,1 à 2,3 s. Indexation de 6 documents : quelques minutes sur processeur. Les deux
pièces de la démo (`ORGANIGRAMME`, `CATALOGUE_RESSOURCES`) sont de faux PDF de 43 et 51 octets : échec d'indexation
attendu, signalé par la synchronisation.

## 7. Risques

| # | Risque | Gravité | État |
|---|---|---|---|
| R1 | Un rôle personnalisé avec `ia.use` sans `quality.read` lisait l'état Qualiopi par l'assistant (compte technique) : contournement des droits GSMS | Élevée | **Corrigé** (refus 403, test) |
| R2 | Un seul compte WeKnora « navigateur » pour tous les utilisateurs GSMS : chacun voyait les conversations des autres dans le moteur IA | Élevée (confidentialité interne) | **Corrigé** : un compte WeKnora par compte GSMS, créé par invitation révoquée aussitôt (inscription libre toujours fermée) ; isolement vérifié contre le moteur |
| R3 | Le code du moteur IA n'était pas versionné (`global-it-ss-template` hors git) | Élevée | **Corrigé** (`ia/moteur`, commit `53f8a52`) |
| R4 | Ollama de dev s'arrête au redémarrage (politique « no ») : recherche et chat en panne sans message clair | Moyenne (dev) | Ouvert : conteneur hors de ce dépôt (`gitss-ollama`) |
| R5 | Sandbox Docker activée en dev (socket Docker = root sur la machine) | Moyenne (dev) | Accepté en dev, coupé en production (`ia/.env.example`) |
| R6 | Jeton MCP sans expiration | Faible | Accepté : réseau interne seulement, refus derrière un proxy, révoqué par désactivation ou `renew` |
| R7 | Injection d'instructions dans un document | Moyenne | Atténuée : agents en lecture seule, aucun outil d'écriture, recherche web et skills coupées ; le contrat d'analyse ne génère rien et rend les passages comme données |
| R8 | `match_count` dépassé par l'enrichissement de contexte (8 à 13 passages pour 5 demandés) | Faible | Contourné dans le contrat (`skip_context_enrichment`) |
| R10 | Les assistants « raisonnement » (« Préparation d'audit », « Résultats et satisfaction ») refusaient toute question : le moteur exigeait un modèle de reclassement sur un agent personnalisé (`rerank model is not configured`), et aucun n'est déclaré. Ils n'avaient donc jamais fonctionné | Élevée | **Corrigé dans le fork** (`ia/moteur/internal/application/service/session_agent_qa.go`) : comme les agents internes, modèle de l'espace s'il existe, sinon recherche sans reclassement ; image reconstruite, l'agent démarre et appelle ses outils |
| R11 | Deux premières sessions IA simultanées d'une même personne (deux onglets) : la seconde échouait (503) | Faible | **Corrigé** (revue CodeRabbit) : nouvelle connexion si l'inscription échoue |
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
5. **Un compte WeKnora par personne** (`service/ia/session.py`) : R2 corrigé, voir §7 et `docs/API.md`.
6. **Base « Documents de l'organisme »** (`service/ia/documents.py`) : liste blanche (pièces de l'organisme et programmes,
   émis ou signés, version en cours, PDF/DOCX/HTML ; jamais de pièce de session, de formateur ni de facturation),
   synchronisation idempotente (ajout, retrait des versions remplacées et pièces retirées, fichier relu avec son
   empreinte) par `ia-preparer` et par le worker toutes les 15 minutes (`--ia-documents-minutes`). Le contrat d'analyse
   cherche aussi dans cette base, sur les seuls documents **encore** éligibles dans GSMS au moment de la question.
   L'assistant « Préparation d'audit » la lit, avec une consigne contre l'injection d'instructions.
7. **Reproductibilité** : `GET /qualiopi/echeances` (et l'outil MCP `lister_echeances`) avait un ordre instable entre
   jalons de même date (test MCP intermittent) ; ordre complet fixé.

8. **Revue CodeRabbit** du code backend de ce chantier (`coderabbit review --committed --base-commit 93cc184 --dir
   backend`) : 1 point, mineur (R11), corrigé et testé ; aucun point de sécurité.
9. **Moteur IA adapté** : un agent personnalisé sans modèle de reclassement cherche sans reclasser (R10). Compilation
   vérifiée par la construction de l'image ; les tests Go du moteur n'ont pas été lancés.

10. **Analyse par le modèle et validation humaine** (contrat `gsms.ia.analyse-indicateur/2`, migration `0029`) : option
    `analyse_ia` ; GSMS envoie à l'assistant interne « Analyse documentaire (GSMS) » (ni base, ni outil, température 0)
    les seuls passages vérifiés, numérotés et balisés comme données ; la réponse JSON est validée par schéma et chaque
    observation ou proposition doit citer un passage fourni, sinon elle est rejetée et comptée. Les propositions
    d'action sont enregistrées (`qualite.ia_proposition`, statut `PROPOSEE`) et acceptées ou rejetées par une personne
    (`quality.write`, motif obligatoire pour un rejet, décision définitive, qui et quand gardés) ; accepter n'applique
    rien. Vérifié par tests avec un moteur simulé, puis **en direct le 27/10/2026** avec le modèle local de dev
    (indicateur 31, 2 passages, 88 s) : chaîne complète, une observation gardée avec ses citations, une rejetée par la
    validation. Qualité faible (le modèle qualifie de « contradiction » deux passages du même texte officiel qui ne se
    contredisent pas) : la mécanique est prête, l'utilité dépend du modèle de production (§12, P0).
11. **Front** : onglet « Analyse documentaire » de la fiche indicateur (droit `ia.use`), qui distingue l'état du moteur,
    les passages retrouvés et l'analyse IA.
12. **Démo** : `seed-demo` dépose de vrais PDF lisibles (texte extractible) ; **Ollama** de dev redémarre seul ;
    **pilote nettoyé** (pièces « PILOTE » remplacées, retirées de l'index par la synchronisation, comptes d'essai ôtés
    de l'espace).

## 10. Configuration (sans secrets)

- API (`.env`) : `WEKNORA_URL`, `WEKNORA_SERVICE_EMAIL`, `WEKNORA_SERVICE_PASSWORD`, `WEKNORA_SERVICE_NAME`,
  `IA_MCP_URL`, `IA_COMPTE_TECHNIQUE_EMAIL`.
- Moteur IA (`ia/.env`, modèle `ia/.env.example`) : base, Redis, `JWT_SECRET`, `SYSTEM_AES_KEY`,
  `SYSTEM_SIGNING_KEY`, `DISABLE_REGISTRATION=false` (avec `auth.registration_mode: invite_register` dans `ia/config/config.yaml`), `WEKNORA_SANDBOX_DOCKER_ENABLED=false`,
  `BUILTIN_MODELS_CONFIG` (fichier de modèles), clés des fournisseurs.
- Compose : `SSRF_WHITELIST_EXTRA=api` (le moteur IA doit joindre le MCP de l'API).

## 11. Déploiement et retour arrière

- Construire : `docker compose build ia-app ia-docreader` ; migrer l'API (`alembic upgrade head`, automatique au
  démarrage de l'API) ; relancer `api` puis `ia-app`.
- Retour arrière du contrat : `alembic downgrade 0027` (supprime seulement la table des traces) et revenir au commit
  précédent. Retour arrière du moteur : les anciennes images `gitss-app:local` et `gitss-docreader:local` restent sur la
  machine ; remettre leur nom dans `docker-compose.yml`.

## 12. Plan, par priorité

1. **P0** : choisir le fournisseur de production (local ou UE), avec un contexte d'au moins 16 000 jetons (consignes
   jamais tronquées), puis rejouer le pilote et le test d'injection au niveau des assistants.
2. **P1** : rejouer en direct, avec le modèle de production, l'analyse par le modèle (contradictions, incomplétude,
   absence de preuve) sur le pilote, et mesurer le taux d'observations rejetées.
3. **P1** : routage local / distant explicite (politique par type de tâche et classe de données), seulement quand un
   modèle distant existe.
4. **P1** : déployer le moteur IA sur le VPS : `deploy/install.sh` et `deploy.sh` ne lancent aujourd'hui ni `ia-app` ni
   ses bases (ni `ia-preparer`).
5. **P2** : une proposition acceptée pourrait préremplir une action corrective dans « Constats et actions » (toujours
   créée par une personne).
6. **P2** : écran Paramètres › Moteur IA (permission `ia.admin`) pour régler les modèles sans le compte de service.
