# API GSMS Qualiopi

Référence de l'API du backend FastAPI (`backend/app`), écrite pour la refonte du front. Tout ce qui suit est tiré du code
(branche `refonte-front`) : la liste des routes a été obtenue en important l'application (`from app.cmd.server import app`) et en
parcourant `app.routes`, puis les droits ont été relus dans chaque routeur, dans `app/middleware/auth.py` et dans les politiques
de domaine (`*/policy.py`).

## 1. Généralités

### Service et préfixes

- Application : `create_app()` dans `backend/app/cmd/server.py`, servie par `uvicorn app.cmd.server:app` (port 8000 dans le conteneur).
- Le reverse proxy (service `web`, `deploy/Caddyfile`) relaie `/api/*` et `/health` vers l'API **sans préfixe ajouté ni retiré** ; la landing est à `/`, le back-office à `/app/`, le moteur IA à `/ia/` (voir `deploy/README.md`).
- En revanche, **chaque routeur porte lui-même le préfixe `/api/v1`** (ex. `/api/v1/auth/login`). Seule `GET /health` est hors
  `/api/v1`.
- Documentation interactive : `/docs` (Swagger) et `/openapi.json`, **uniquement si `APP_ENV != production`**
  (`docs_url=None` et `openapi_url=None` en production ; ReDoc est désactivé partout).
- CORS (`CORSMiddleware`) : origines = `CORS_ORIGINS` (liste séparée par des virgules, `*` refusé en production),
  `allow_credentials=True`, méthodes `GET POST PUT PATCH DELETE`, en-têtes autorisés `Authorization` et `Content-Type` seulement.

### Authentification

- `POST /api/v1/auth/login` avec `{"email", "password"}` → `{"access_token", "token_type": "bearer", "user": {id, email, full_name, roles, is_active}}`.
- Le jeton est un **JWT HS256** signé avec `JWT_SECRET`, charge utile `{"sub": <id utilisateur>, "ver": <version>, "iat": …,
  "exp": …}`, durée `JWT_TTL_MINUTES` (défaut 720 min = 12 h). Pas de route de rafraîchissement.
- **Révocation** (version de jeton, colonne `iam.user.token_version`, migration 0023) : chaque requête compare `ver` à la
  version du compte ; un écart répond **401** « Session révoquée : reconnectez-vous ». La version s'incrémente :
  - au **changement de mot de passe** (`POST /auth/me/password`, qui rend un jeton neuf pour la session courante :
    le client doit remplacer le sien) ;
  - à la **désactivation** d'un compte (`PUT /auth/users/{id}/active`) : une réactivation ne rouvre pas les anciennes sessions ;
  - à la **déconnexion partout** (`POST /auth/me/deconnexion-partout`, celle-ci comprise).
  Un **changement de rôles** ne révoque pas : le jeton ne porte aucun droit, les permissions sont relues en base à chaque
  requête, le retrait d'un rôle s'applique donc dès la requête suivante sans déconnecter la personne. Un jeton émis avant
  la migration 0023 (sans `ver`) est refusé : chacun se reconnecte une fois. Le jeton technique `mcp` n'est pas concerné
  (il reste lié à l'empreinte du mot de passe du compte technique, voir « Moteur IA et serveur MCP »).
- Il se transmet dans l'en-tête **`Authorization: Bearer <jeton>`** (`HTTPBearer(auto_error=False)` dans `app/middleware/auth.py`).
  Jeton absent → 401 « Authentification requise » ; invalide ou expiré → 401 ; compte inactif ou supprimé → 401.
- L'ancien front stockait le jeton dans un cookie httpOnly via ses propres routes Next (`/api/auth/login`, relais
  `/api/backend/*`) ; c'était un choix du front, l'API ne lit aucun cookie.

### Permissions, rôles et modules

- Les droits sont des **permissions** (catalogue figé dans `app/router/rbac.py`, 34 codes). Un compte a l'union des
  permissions de ses rôles : **rôles système** (`admin`, `qualite`, `assistant_qualite`, `gestion`, `financement`,
  `formateur`, `rh`, `lecture`, non modifiables) et **rôles personnalisés** (table `iam.role`).
- Chaque permission appartient à une **fonctionnalité** (module). Un module désactivé retire ses permissions à tout le monde :
  la route répond alors 403 avec un message qui renvoie à « Administration › Paramètres › Modules ».
- Dépendances FastAPI utilisées :
  - `current_user` → « Authentifié » dans les tableaux (tout compte actif) ;
  - `require("x")` → permission `x` obligatoire, sinon **403** ;
  - `require_any("x", "y")` → au moins une des deux, sinon **403**.
- Au-delà de la dépendance, beaucoup de routes appliquent une **politique de domaine** (`CapaPolicy`, `AuditPolicy`,
  `EditionPolicy`, `TrainingPolicy`, `AttendancePolicy`, `JourneyPolicy`, `FundingPolicy`, `capability()` EDOF…) qui revérifie
  une permission plus forte, l'état de l'objet et les conditions métier. Un refus de politique répond **409** (pas 403) :
  `{"error": "<CODE>", "detail": "<message>", "details": [...]}`, par exemple `PERMISSION_MISSING`, `INVALID_TRANSITION`.
  Ces contrôles supplémentaires figurent après le tiret dans la colonne « Droits requis ».
- **Portée « ses sessions »** (`app/application/access/training_scope.py`) : un compte qui n'a que `sessions.read_own` ne voit que les sessions
  dont le formateur est relié à son compte ; une session hors portée répond 404.
- Les réponses de détail exposent souvent un objet `capabilities` (`{"allowed": true}` ou `{"allowed": false, "code", "message"}`) :
  le front affiche les boutons d'après ces décisions plutôt que de recalculer les droits.

### Erreurs

`app/errors/errors.py` : `{"error": code, "detail": message}` (+ `details` pour les refus de politique).
`not_found` 404, `conflict` 409, `invalid_state` 422, `forbidden` 403, refus de politique 409. Les `HTTPException` FastAPI
gardent la forme `{"detail": …}`.

### Pages publiques par lien signé

Pas de compte : un jeton `<valeur>.<signature>` (HMAC-SHA256 de `JWT_SECRET`, préfixé par l'usage, `app/application/service/questionnaires/tokens.py`).
Exception, les **liens de documents** : la valeur signée est `<inscription>:<document>:<expiration>` (horodatage Unix,
`DOCUMENT_LINK_DAYS` = 60 jours après l'émission du lien, par défaut) et la clé est dérivée de `JWT_SECRET` pour cet usage
seul (HMAC-SHA256 de `JWT_SECRET` sur un libellé d'usage). Lien expiré → **410** `link_closed`. Chaque relance et chaque
ouverture de l'espace du stagiaire émettent un lien neuf. **Transition** : les liens envoyés avant ce format (sans date, clé
`JWT_SECRET`) restent lus tant que le document a été émis il y a moins de 60 jours ; ils s'éteignent donc seuls, sans
date butoir à surveiller (la branche de lecture pourra être retirée 60 jours après la mise en production).

| Usage | Lien envoyé (construit par l'API) | Route API appelée |
|---|---|---|
| Questionnaire (besoin, satisfaction à chaud / à froid, entreprise) | `{PUBLIC_URL}/q/{jeton}` (`questionnaires/service.py`) | `GET`/`POST /api/v1/public/questionnaires/{jeton}` |
| Espace du stagiaire | `{PUBLIC_URL}/espace/{jeton}` (`journey/espace.py`) | `GET /api/v1/public/espace/{jeton}` |
| Document du stagiaire (convocation, attestation) | `{PUBLIC_URL}/api/public/documents/{jeton}` (`journey/espace.py`, `relances/planner.py`) | `GET /api/v1/public/documents/{jeton}` |
| Émargement du stagiaire | chemin relatif `/emarger?code=…` / `/emarger?jeton=…` (`attendance/service.py`, `SIGN_PATH`) | `POST /api/v1/emargement/signer` |

`/q/…`, `/espace/…` et `/emarger` sont des **pages du back-office `app/`** (routes publiques sans compte ni menu,
`app/src/views/gsms/public/`), servies à la racine du domaine : `deploy/Caddyfile` les réécrit vers `/app/index.html`
(CSP du back-office), `app/vite.config.ts` fait de même en dev ; le routeur prend alors `/` pour base, l'adresse du lien
ne change pas. `/api/public/documents/…` (liens déjà envoyés, sans `v1`) est réécrit vers `/api/v1/public/documents/…`
par Caddy et par le proxy de dev.

### Limites de débit

Compteurs en mémoire du processus, fenêtre glissante (`app/common/limites.py`) ; au-delà, **429** avec un message en
français (`{"detail": …}`, préinscription : `{error, detail, message}`) et l'en-tête `Retry-After` (secondes). Le déploiement
est mono-instance (un seul processus uvicorn) : un compteur local suffit, sans table ni migration ; avec plusieurs processus,
il faudrait un compteur partagé (PostgreSQL). Seuls une clé (adresse, e-mail) et des horodatages sont gardés, oubliés à la fin
de la fenêtre.

| Route | Limite |
|---|---|
| `POST /api/v1/auth/login` | 30 tentatives par adresse en 10 min ; 10 échecs par e-mail en 15 min (le bon mot de passe est alors refusé aussi jusqu'à la fin de la fenêtre ; une connexion réussie efface les échecs) |
| `/api/v1/public/questionnaires/…`, `/documents/…`, `/espace/…` | 300 requêtes par adresse en 10 min |
| `POST /api/v1/emargement/signer` | 120 signatures par adresse en 10 min (une salle entière signe souvent depuis le même réseau) |
| `POST /api/v1/public/preinscriptions` | 5 envois valides par adresse en 10 min |
| `POST /api/v1/public/contact` | 5 messages valides par adresse en 10 min (`Retry-After`) |

Adresse du client : derrière le reverse proxy (connexion venue d'une adresse privée ou locale), la **dernière** adresse de
`X-Forwarded-For`, ajoutée par Caddy ou Traefik ; une connexion directe depuis une adresse publique garde la sienne.
Connexion : un e-mail inconnu ou un compte inactif coûtent le même calcul bcrypt (empreinte factice) qu'un compte réel.
Corps de requête plafonné à 20 Mo par Caddy (`request_body { max_size 20MB }`, `deploy/Caddyfile`), 15 Mo par fichier côté API.

## 2. Inventaire des routes HTTP

**Total : 264 routes** (263 sous `/api/v1` + `GET /health`, décompte du 26/10/2026), hors routes techniques `/docs`, `/docs/oauth2-redirect` et
`/openapi.json` (absentes en production). Les 65 routes CRUD sont générées par `crud_router()` (`app/handler/crud.py`) pour 13
ressources déclarées dans `app/handler/training_resources.py` (liste `ROUTERS`).

Légende des droits : « Public » = aucune authentification ; « Authentifié » = jeton valide ; `` `x` `` = permission requise
(403 sinon) ; `` `x` ou `y` `` = l'une des deux. Après le tiret : contrôles faits dans le handler ou la politique.

### Système

Fichier : `backend/app/cmd/server.py` — 1 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/health` | Vérifie que l'API répond et que la base est joignable (`SELECT 1`). | Public |

### Authentification, comptes et rôles

Fichier : `backend/app/handler/auth.py` — 14 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Connexion e-mail + mot de passe ; renvoie `access_token` (JWT HS256), `token_type`, `user`. | Public — limite de débit (429, §1) |
| `GET` | `/api/v1/auth/me` | Compte connecté et ses permissions effectives (modules actifs seulement). | Authentifié |
| `PATCH` | `/api/v1/auth/me` | Modifie son propre nom affiché. | Authentifié |
| `POST` | `/api/v1/auth/me/password` | Change son mot de passe (actuel redemandé, 12 caractères min., 72 octets max.) ; révoque tous ses jetons et rend `{access_token, token_type, user}` pour la session courante. | Authentifié — 403 si mot de passe actuel incorrect |
| `POST` | `/api/v1/auth/me/deconnexion-partout` | Déconnecte toutes ses sessions, celle-ci comprise (révoque tous ses jetons) ; 204. | Authentifié |
| `GET` | `/api/v1/auth/permissions` | Catalogue des permissions (code, libellé, fonctionnalité). | Authentifié |
| `GET` | `/api/v1/auth/roles` | Rôles système puis rôles personnalisés de l'organisme. | Authentifié |
| `POST` | `/api/v1/auth/roles` | Crée un rôle personnalisé (code, libellé, permissions). | `users.manage` — anti-escalade : on ne donne pas une permission qu'on n'a pas |
| `PUT` | `/api/v1/auth/roles/{code}` | Modifie un rôle personnalisé (rôle système : 403). | `users.manage` — anti-escalade |
| `DELETE` | `/api/v1/auth/roles/{code}` | Supprime un rôle personnalisé non attribué (sinon 409). | `users.manage` — anti-escalade |
| `GET` | `/api/v1/auth/users` | Liste des comptes. | `users.manage` |
| `POST` | `/api/v1/auth/users` | Crée un compte (rôle `lecture` par défaut). | `users.manage` — anti-escalade sur les rôles donnés |
| `PUT` | `/api/v1/auth/users/{user_id}/roles` | Remplace les rôles d'un compte. | `users.manage` — ni son propre compte, ni un compte plus puissant ; anti-escalade |
| `PUT` | `/api/v1/auth/users/{user_id}/active` | Active ou désactive un compte (la désactivation révoque ses jetons). | `users.manage` — ni son propre compte, ni un compte plus puissant |

### Socle : démarrage, modules, réglages, organisme

Fichier : `backend/app/handler/platform.py` — 9 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/bootstrap` | Démarrage du front : utilisateur, permissions, modules actifs, organisme (nom court, couleur), navigation. | Authentifié |
| `GET` | `/api/v1/features` | Fonctionnalités (modules) : active, disponible, dépendances. | Authentifié |
| `PUT` | `/api/v1/features/{code}` | Active ou désactive un module (dépendances et abonnement vérifiés). | `settings.manage` |
| `GET` | `/api/v1/settings` | Réglages des modules actifs : schéma JSON, défaut, valeur en vigueur, prochaine valeur. | `settings.manage` |
| `GET` | `/api/v1/settings/{key}/history` | Historique daté d'un réglage. | `settings.manage` |
| `PUT` | `/api/v1/settings/{key}` | Nouvelle valeur d'un réglage à une date d'effet (motif obligatoire si réglementaire). | `settings.manage` |
| `GET` | `/api/v1/listes-de-valeurs` | Listes code → libellé que l'API accepte en saisie (`code`, `libelle`, `source` = constante de `app/types/training.py`, `valeurs[]`) : types de lieu, statuts de lieu ou d'équipement, catégories d'équipement, types de partenaire, domaines de veille, types et parties prenantes de réclamation, publics d'enquête, types de titre. | Authentifié |
| `GET` | `/api/v1/organisme` | Identité réglementaire de l'organisme et catégories d'actions possibles. | Authentifié |
| `PATCH` | `/api/v1/organisme` | Modifie l'organisme (crée la ligne si absente) ; relance le moteur. | `settings.manage` |

### Pilotage : feuille de route

Fichier : `backend/app/handler/roadmap.py` — 1 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/pilotage/feuille-de-route` | Feuille de route : échéances de toutes les sources, par semaine (`semaines` 1–26). | Authentifié — contenu filtré : `quality.read` (jalons, actions, preuves), `staff.read` (titres), `funding.read` + module funding (financement) |

### Pilotage : planning et bilans

Fichier : `backend/app/handler/pilotage.py` — 3 route(s). Services : `backend/app/application/service/pilotage/`.

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/planning` | Créneaux des sessions du `du` au `au` (93 jours au plus, 422 sinon ; défaut : 31 jours dès aujourd'hui) : demi-journées d'émargement, sinon session entière ; formateur, lieu, salle, programme, effectif, capacité ; filtres `formateur`, `lieu` (texte), `programme`, `annulees` ; conflits calculés (même formateur ou même salle, créneaux qui se chevauchent ; `CERTAIN` ou `A_VERIFIER` sans horaires), jamais bloquants ; valeurs proposées aux filtres. | `sessions.read` ou `sessions.read_own` — portée : sessions visibles ; conflits cherchés seulement entre créneaux visibles |
| `GET` | `/api/v1/bilans` | Inventaire des bilans et rapports produits par l'API (route, nature, permissions, `disponible` pour ce compte). | Authentifié |
| `GET` | `/api/v1/bilans/bpf?exercice=AAAA` | **Aide** au bilan pédagogique et financier (cerfa 10443, art. L. 6352-11) : stagiaires, heures-stagiaires, formateurs, sous-traitance, objectif ; chaque cadre marqué `CALCULE`, `INDICATIF`, `PARTIEL` ou `NON_CALCULABLE` avec ce qui manque. Ne produit pas le BPF. Sources : `docs/bilans/SOURCES.md`. | `sessions.read` — indications financières (paiements saisis) seulement avec `funding.read` ; exercice à venir : 422 |

### Qualiopi : référentiel, moteur, revues, cycles, actions correctives

Fichier : `backend/app/handler/qualiopi.py` — 24 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/referentials/import` | Importe une version du référentiel depuis `REFERENTIALS_DIR` (ex. `qualiopi/v10`) et l'active si en vigueur. | `referential.manage` |
| `GET` | `/api/v1/referentials` | Versions importées (empreintes, en vigueur) et dossiers importables livrés. | `quality.read` |
| `GET` | `/api/v1/referentials/active` | Version du référentiel en vigueur. | `quality.read` |
| `GET` | `/api/v1/referentials/active/indicators` | Indicateurs du référentiel en vigueur (résumé). | `quality.read` |
| `GET` | `/api/v1/referentials/active/indicators/{number}` | Un indicateur : textes officiels, note éditoriale, contrôles du moteur. | `quality.read` |
| `POST` | `/api/v1/qualiopi/evaluate` | Réconcilie les preuves et réévalue tout (« tout réévaluer »). | `quality.write` |
| `GET` | `/api/v1/qualiopi/readiness` | État de préparation par indicateur sur une période (`du`/`au`, sinon cycle en cours). | `quality.read` |
| `GET` | `/api/v1/sessions/{session_id}/dossier` | Dossier qualité d'une session (preuves par indicateur). | `quality.read` |
| `POST` | `/api/v1/evidence/{evidence_id}/validation` | Valide ou rejette une preuve, avec grille de relecture. | `evidence.validate` — auto-validation refusée sauf réglage `quality.allow_self_validation` |
| `GET` | `/api/v1/qualiopi/circuit` | Circuit de session appliqué (`config/circuits/standard.yaml`) : `code`, `titre`, `jalons[]` (`cle`, `libelle`, `ancre` start / end, `decalage_jours`, `alerte_jours`, `preuve`, `faits`, `inscriptions`, `responsable`, `indicateurs`). Lecture seule. | `quality.read` |
| `GET` | `/api/v1/qualiopi/echeances` | Jalons de l'échéancier en retard ou à échéance sous `days` jours. | `quality.read` |
| `POST` | `/api/v1/qualiopi/indicateurs/{number}/revues` | Revue humaine attestée d'un indicateur (état et preuves figés). | `evidence.validate` |
| `GET` | `/api/v1/qualiopi/indicateurs/{number}/revues` | Historique des revues d'un indicateur. | `quality.read` |
| `POST` | `/api/v1/qualiopi/cycles` | Crée un cycle de certification (initial, surveillance, renouvellement, interne). | `quality.write` |
| `GET` | `/api/v1/qualiopi/cycles` | Liste des cycles de certification. | `quality.read` |
| `GET` | `/api/v1/qualiopi/criteres` | Critères et indicateurs avec état calculé et nombre d'écarts ouverts. | `quality.read` |
| `GET` | `/api/v1/qualiopi/indicateurs/{number}` | Chaîne complète d'un indicateur : exigences, preuves, contrôles, écarts, actions. | `quality.read` |
| `GET` | `/api/v1/qualiopi/carnet` | Carnet d'audit (une fiche par indicateur), optionnellement pour une session. | `quality.read` |
| `GET` | `/api/v1/qualiopi/carnet/impression` | Carnet d'audit en HTML A4 imprimable. | `quality.read` |
| `GET` | `/api/v1/qualiopi/actions` | Actions correctives (filtre statut, en retard) avec capacités. | `quality.read` |
| `GET` | `/api/v1/qualiopi/ecarts` | Écarts à traiter (ouverts / en traitement) et possibilité d'ouvrir une action. | `quality.read` |
| `GET` | `/api/v1/qualiopi/actions/{capa_id}` | Détail d'une action corrective. | `quality.read` |
| `POST` | `/api/v1/qualiopi/ecarts/{finding_id}/actions` | Ouvre une action corrective ou préventive sur un écart. | `quality.read` — `quality.write` (politique `CapaPolicy`, refus 409) |
| `POST` | `/api/v1/qualiopi/actions/{capa_id}/{action}` | Fait avancer une action : `demarrer`, `realiser`, `verifier`, `annuler`. | `quality.read` — `quality.write` (demarrer, realiser, annuler) ou `evidence.validate` (verifier) — `CapaPolicy`, refus 409 |

### Qualiopi : écrans preuves, évaluations, constats, audits internes

Fichier : `backend/app/handler/qualiopi_ecrans.py` — 13 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/qualiopi/preuves` | Liste des preuves et leurs comptes (filtres statut…). | `quality.read` |
| `GET` | `/api/v1/qualiopi/preuves/{evidence_id}` | Une preuve : origine, indicateurs, grille, décisions, historique, capacités. | `quality.read` |
| `GET` | `/api/v1/qualiopi/evaluations` | Dernières évaluations du moteur et état par indicateur. | `quality.read` |
| `GET` | `/api/v1/qualiopi/evaluations/resultats` | Résultats des contrôles (dernier par cible), du pire au meilleur. | `quality.read` |
| `GET` | `/api/v1/qualiopi/constats` | Tous les constats (écarts), y compris résolus. | `quality.read` |
| `GET` | `/api/v1/qualiopi/formations/{program_id}` | Vue moteur d'une formation : état par indicateur sur ses contrôles. | `quality.read` |
| `GET` | `/api/v1/qualiopi/audits` | Liste des audits internes. | `quality.read` |
| `GET` | `/api/v1/qualiopi/audits/echantillon` | Échantillon de sessions proposé pour un audit. | `quality.read` |
| `POST` | `/api/v1/qualiopi/audits` | Ouvre un audit interne (photo figée des résultats, preuves, écarts). | `quality.read` — `quality.write` (`AuditPolicy`, refus 409) |
| `GET` | `/api/v1/qualiopi/audits/comparaison` | Comparaison d'audits indicateur par indicateur (4 derniers par défaut). | `quality.read` |
| `GET` | `/api/v1/qualiopi/audits/{audit_id}` | Détail d'un audit avec capacités (juger, clore). | `quality.read` |
| `POST` | `/api/v1/qualiopi/audits/{audit_id}/indicateurs/{number}` | Enregistre le jugement d'un indicateur dans un audit en cours. | `quality.read` — `evidence.validate` (`AuditPolicy`, refus 409) |
| `POST` | `/api/v1/qualiopi/audits/{audit_id}/cloture` | Clôt l'audit ; chaque non-conformité devient un constat. | `quality.read` — `evidence.validate` + tous les indicateurs jugés (`AuditPolicy`, refus 409) |

### Journal des modifications

Fichier : `backend/app/handler/journal.py` — 2 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/journal` | Historique des modifications d'une ligne (`table`, `entity_id`). | `journal.read` |
| `GET` | `/api/v1/journal/recent` | Fil des dernières modifications, paginé par `avant`. | `journal.read` |

### Dossiers de pièces (organisme, formateurs)

Fichier : `backend/app/handler/documents.py` — 6 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/dossiers/{subject}/{subject_id}/pieces/{requirement}` | Dépose un fichier dans un dossier de pièces (multipart, `grille` JSON, `note`). | Authentifié — selon `subject` : `quality.write` (ORGANISME) ou `trainers.write` (FORMATEUR), sinon 403 |
| `POST` | `/api/v1/dossiers/{subject}/{subject_id}/pieces/{requirement}/papier` | Déclare une pièce conservée sur papier (lieu + grille). | Authentifié — selon `subject` : `quality.write` (ORGANISME) ou `trainers.write` (FORMATEUR), sinon 403 |
| `GET` | `/api/v1/dossiers/{subject}/modeles/{requirement}` | Télécharge la trame Markdown d'une pièce. | `quality.read` |
| `GET` | `/api/v1/dossiers/{subject}/{subject_id}` | État d'un dossier de pièces (attendues, déposées, validité). | `quality.read` |
| `GET` | `/api/v1/documents/{document_id}/contenu` | Télécharge un document stocké (empreinte vérifiée) : pièces des dossiers et preuves Qualiopi (convocations, attestations, conventions…). | `quality.read` (voulu : c'est la permission du dossier de preuves ; `documents.read` est celle des documents professionnels) — documents EDOF : `edof.read`, ou `edof.sensitive` pour les pièces sensibles ; version de document professionnel (`EDITION`) : `documents.read` en plus ; facture (`FACTURE`) : `invoices.read` en plus (403) |
| `POST` | `/api/v1/dossiers/{subject}/{subject_id}/demandes/{requirement}` | Demande une pièce à quelqu'un avec une échéance. | Authentifié — selon `subject` : `quality.write` (ORGANISME) ou `trainers.write` (FORMATEUR), sinon 403 |

### Formation : sessions, cycle de vie, inscriptions

Fichier : `backend/app/handler/training.py` — 13 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/formations` | Liste des formations (programmes). | `sessions.read` ou `sessions.read_own` |
| `GET` | `/api/v1/formateurs` | Liste des formateurs. | `sessions.read` ou `sessions.read_own` |
| `GET` | `/api/v1/stagiaires` | Liste des stagiaires. | `sessions.read` |
| `GET` | `/api/v1/learners/{learner_id}/inscriptions` | Inscriptions d'un stagiaire, session la plus récente d'abord (`id`, `statut`, `financement`, `entreprise_id`, `abandon_le`, `session` : référence, statut, dates, formation, formateur) ; 404 si stagiaire inconnu. | `sessions.read` (même droit que la fiche `GET /learners/{id}`) |
| `GET` | `/api/v1/sessions` | Sessions (filtres `statut`, `du`, `au`, `formateur` = id du formateur, appliqué dans la portée du compte) ; un formateur ne voit que les siennes. | `sessions.read` ou `sessions.read_own` — portée : sans `sessions.read`, sessions du formateur relié au compte |
| `POST` | `/api/v1/sessions` | Crée une session. | `sessions.write` |
| `GET` | `/api/v1/sessions/{session_id}` | Session, inscriptions et capacités de l'utilisateur. | `sessions.read` ou `sessions.read_own` — portée : hors de ses sessions → 404 |
| `GET` | `/api/v1/sessions/{session_id}/activite` | Fil d'activité de la session. | `sessions.read` ou `sessions.read_own` — portée : hors de ses sessions → 404 |
| `GET` | `/api/v1/sessions/{session_id}/capabilities` | Capacités (edit, delete, enroll, transitions) sur la session. | `sessions.read` ou `sessions.read_own` — portée : hors de ses sessions → 404 |
| `PATCH` | `/api/v1/sessions/{session_id}` | Modifie une session (champs figés après démarrage). | `sessions.write` — `TrainingPolicy` (état), refus 409 |
| `DELETE` | `/api/v1/sessions/{session_id}` | Supprime une session planifiée sans inscription. | `sessions.write` — `TrainingPolicy` (état), refus 409 |
| `POST` | `/api/v1/sessions/{session_id}/transitions/{action}` | Cycle de vie : `confirm`, `start`, `finish`, `close`, `cancel` (motif). | `sessions.write` — `TrainingPolicy` (état, conditions de clôture), refus 409 |
| `POST` | `/api/v1/sessions/{session_id}/inscriptions` | Inscrit un stagiaire (entreprise, financement). | `sessions.write` — `TrainingPolicy` (inscriptions ouvertes, capacité), refus 409 |

### Offre de formation : catalogue, résultats, ressources

Fichier : `backend/app/handler/training_offre.py` — 5 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/formation/resultats` | Résultats mesurés par formation sur `mois` mois (I2, I3). | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/formation/resultats/{program_id}/publication` | Publie les résultats mesurés d'une formation. | `sessions.read` ou `quality.read` — `sessions.write` (`ResultsPolicy`, refus 409) |
| `GET` | `/api/v1/formation/ressources` | Ressources pédagogiques de toutes les formations (I19). | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/formation/catalogue` | Catalogue des formations avec sessions. | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/formation/catalogue/{program_id}` | Sessions et résultats mesurés d'une formation. | `sessions.read` ou `quality.read` |

### Ressources CRUD du domaine formation et qualité

Fichier : `backend/app/handler/training_resources.py (fabrique backend/app/handler/crud.py)` — 65 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/programs` | Liste : formations (programmes). | `sessions.read` |
| `GET` | `/api/v1/programs/{item_id}` | Détail : formations (programmes). | `sessions.read` |
| `POST` | `/api/v1/programs` | Création : formations (programmes). | `sessions.write` |
| `PATCH` | `/api/v1/programs/{item_id}` | Mise à jour partielle : formations (programmes). | `sessions.write` |
| `DELETE` | `/api/v1/programs/{item_id}` | Suppression (409 si encore référencée) : formations (programmes). | `sessions.write` |
| `GET` | `/api/v1/companies` | Liste : entreprises clientes. | `sessions.read` |
| `GET` | `/api/v1/companies/{item_id}` | Détail : entreprises clientes. | `sessions.read` |
| `POST` | `/api/v1/companies` | Création : entreprises clientes. | `sessions.write` |
| `PATCH` | `/api/v1/companies/{item_id}` | Mise à jour partielle : entreprises clientes. | `sessions.write` |
| `DELETE` | `/api/v1/companies/{item_id}` | Suppression (409 si encore référencée) : entreprises clientes. | `sessions.write` |
| `GET` | `/api/v1/learners` | Liste : apprenants ; filtre `entreprise` (id de l'entreprise). | `sessions.read` |
| `GET` | `/api/v1/learners/{item_id}` | Détail : apprenants. | `sessions.read` |
| `POST` | `/api/v1/learners` | Création : apprenants. | `sessions.write` |
| `PATCH` | `/api/v1/learners/{item_id}` | Mise à jour partielle : apprenants. | `sessions.write` |
| `DELETE` | `/api/v1/learners/{item_id}` | Suppression (409 si encore référencée) : apprenants. | `sessions.write` |
| `GET` | `/api/v1/trainers` | Liste : formateurs. | `sessions.read` |
| `GET` | `/api/v1/trainers/{item_id}` | Détail : formateurs. | `sessions.read` |
| `POST` | `/api/v1/trainers` | Création : formateurs. | `trainers.write` |
| `PATCH` | `/api/v1/trainers/{item_id}` | Mise à jour partielle : formateurs. | `trainers.write` |
| `DELETE` | `/api/v1/trainers/{item_id}` | Suppression (409 si encore référencée) : formateurs. | `trainers.write` |
| `GET` | `/api/v1/trainer-qualifications` | Liste : qualifications des formateurs ; filtre `formateur` (id). | `sessions.read` |
| `GET` | `/api/v1/trainer-qualifications/{item_id}` | Détail : qualifications des formateurs. | `sessions.read` |
| `POST` | `/api/v1/trainer-qualifications` | Création : qualifications des formateurs. | `trainers.write` |
| `PATCH` | `/api/v1/trainer-qualifications/{item_id}` | Mise à jour partielle : qualifications des formateurs. | `trainers.write` |
| `DELETE` | `/api/v1/trainer-qualifications/{item_id}` | Suppression (409 si encore référencée) : qualifications des formateurs. | `trainers.write` |
| `GET` | `/api/v1/staff-development` | Liste : actions de développement des compétences (formateurs) ; filtre `formateur` (id). | `sessions.read` |
| `GET` | `/api/v1/staff-development/{item_id}` | Détail : actions de développement des compétences (formateurs). | `sessions.read` |
| `POST` | `/api/v1/staff-development` | Création : actions de développement des compétences (formateurs). | `trainers.write` |
| `PATCH` | `/api/v1/staff-development/{item_id}` | Mise à jour partielle : actions de développement des compétences (formateurs). | `trainers.write` |
| `DELETE` | `/api/v1/staff-development/{item_id}` | Suppression (409 si encore référencée) : actions de développement des compétences (formateurs). | `trainers.write` |
| `GET` | `/api/v1/premises` | Liste : lieux (sites, salles). | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/premises/{item_id}` | Détail : lieux (sites, salles). | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/premises` | Création : lieux (sites, salles). | `sessions.write` |
| `PATCH` | `/api/v1/premises/{item_id}` | Mise à jour partielle : lieux (sites, salles). | `sessions.write` |
| `DELETE` | `/api/v1/premises/{item_id}` | Suppression (409 si encore référencée) : lieux (sites, salles). | `sessions.write` |
| `GET` | `/api/v1/equipment` | Liste : équipements. | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/equipment/{item_id}` | Détail : équipements. | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/equipment` | Création : équipements. | `sessions.write` |
| `PATCH` | `/api/v1/equipment/{item_id}` | Mise à jour partielle : équipements. | `sessions.write` |
| `DELETE` | `/api/v1/equipment/{item_id}` | Suppression (409 si encore référencée) : équipements. | `sessions.write` |
| `GET` | `/api/v1/subcontractors` | Liste : sous-traitants. | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/subcontractors/{item_id}` | Détail : sous-traitants. | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/subcontractors` | Création : sous-traitants. | `quality.write` |
| `PATCH` | `/api/v1/subcontractors/{item_id}` | Mise à jour partielle : sous-traitants. | `quality.write` |
| `DELETE` | `/api/v1/subcontractors/{item_id}` | Suppression (409 si encore référencée) : sous-traitants. | `quality.write` |
| `GET` | `/api/v1/partners` | Liste : partenaires (handicap, socio-économiques). | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/partners/{item_id}` | Détail : partenaires (handicap, socio-économiques). | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/partners` | Création : partenaires (handicap, socio-économiques). | `quality.write` |
| `PATCH` | `/api/v1/partners/{item_id}` | Mise à jour partielle : partenaires (handicap, socio-économiques). | `quality.write` |
| `DELETE` | `/api/v1/partners/{item_id}` | Suppression (409 si encore référencée) : partenaires (handicap, socio-économiques). | `quality.write` |
| `GET` | `/api/v1/watch-items` | Liste : éléments de veille. | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/watch-items/{item_id}` | Détail : éléments de veille. | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/watch-items` | Création : éléments de veille. | `quality.write` |
| `PATCH` | `/api/v1/watch-items/{item_id}` | Mise à jour partielle : éléments de veille. | `quality.write` |
| `DELETE` | `/api/v1/watch-items/{item_id}` | Suppression (409 si encore référencée) : éléments de veille. | `quality.write` |
| `GET` | `/api/v1/complaints` | Liste : réclamations, difficultés, aléas. | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/complaints/{item_id}` | Détail : réclamations, difficultés, aléas. | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/complaints` | Création : réclamations, difficultés, aléas. | `quality.write` |
| `PATCH` | `/api/v1/complaints/{item_id}` | Mise à jour partielle : réclamations, difficultés, aléas. | `quality.write` |
| `DELETE` | `/api/v1/complaints/{item_id}` | Suppression (409 si encore référencée) : réclamations, difficultés, aléas. | `quality.write` |
| `GET` | `/api/v1/surveys` | Liste : enquêtes de satisfaction. | `sessions.read` ou `quality.read` |
| `GET` | `/api/v1/surveys/{item_id}` | Détail : enquêtes de satisfaction. | `sessions.read` ou `quality.read` |
| `POST` | `/api/v1/surveys` | Création : enquêtes de satisfaction. | `quality.write` |
| `PATCH` | `/api/v1/surveys/{item_id}` | Mise à jour partielle : enquêtes de satisfaction. | `quality.write` |
| `DELETE` | `/api/v1/surveys/{item_id}` | Suppression (409 si encore référencée) : enquêtes de satisfaction. | `quality.write` |

### Fiche formation et référencement CPF (EDOF)

Fichier : `backend/app/handler/edof.py` — 27 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/fiches/{program_id}` | Fiche formation complète : certification, intervenants, ressources, versions, manques, capacités. | `sessions.read` ou `edof.read` |
| `PUT` | `/api/v1/fiches/{program_id}/certification` | Renseigne la certification visée (RNCP/RS, habilitation…) ; invalide les vérifications si les valeurs changent. | `sessions.write` |
| `POST` | `/api/v1/fiches/{program_id}/verifications` | Atteste la vérification de la certification, de l'habilitation ou d'une autorisation. | `programs.validate` |
| `POST` | `/api/v1/fiches/{program_id}/intervenants` | Associe un formateur à la formation (rôle, modules). | `sessions.write` |
| `DELETE` | `/api/v1/fiches/{program_id}/intervenants/{link_id}` | Retire un intervenant de la formation. | `sessions.write` |
| `POST` | `/api/v1/fiches/{program_id}/ressources` | Ajoute une ressource pédagogique à la formation. | `sessions.write` |
| `PATCH` | `/api/v1/fiches/{program_id}/ressources/{resource_id}` | Modifie une ressource pédagogique. | `sessions.write` |
| `DELETE` | `/api/v1/fiches/{program_id}/ressources/{resource_id}` | Supprime une ressource pédagogique. | `sessions.write` |
| `POST` | `/api/v1/fiches/{program_id}/versions` | Valide (fige) une nouvelle version de la fiche formation. | `programs.validate` |
| `GET` | `/api/v1/fiches/{program_id}/versions/{version_id}/programme` | Programme HTML imprimable d'une version validée (`telecharger=true` : pièce jointe). | `sessions.read` ou `edof.read` |
| `GET` | `/api/v1/fiches/{program_id}/versions/{version_id}/apercu-public` | Aperçu de l'information publique d'une version validée. | `sessions.read` ou `edof.read` |
| `GET` | `/api/v1/fiches/{program_id}/suivi-pedagogique` | Synthèse du suivi pédagogique de la formation. | `sessions.read` ou `edof.read` |
| `GET` | `/api/v1/edof/referentiel` | Référentiel des pièces EDOF (version, sources, pièces). | `edof.read` |
| `GET` | `/api/v1/edof/etablissement` | Profil et dossier EDOF de l'établissement (créés à la première lecture). | `edof.read` — pièces sensibles masquées sans `edof.sensitive` |
| `PATCH` | `/api/v1/edof/etablissement` | Met à jour le profil EDOF de l'établissement. | `edof.write` — attester une vérification humaine exige `edof.validate` (sinon 422) |
| `POST` | `/api/v1/edof/formations/{program_id}/dossier` | Crée le dossier EDOF d'une formation. | `edof.write` |
| `GET` | `/api/v1/edof/dossiers/{dossier_id}` | Dossier EDOF : pièces, anomalies, compléments, capacités. | `edof.read` |
| `POST` | `/api/v1/edof/dossiers/{dossier_id}/transitions/{action}` | Fait avancer le dossier : `valider`, `rouvrir`, `declarer_depot`, `enregistrer_complements`, `declarer_complements_transmis`, `enregistrer_decision`. | `edof.read` — `edof.validate` (valider, rouvrir) ou `edof.write` (autres) — `capability()`, refus 409 |
| `POST` | `/api/v1/edof/dossiers/{dossier_id}/pieces/{requirement}` | Dépose une pièce EDOF (multipart + métadonnées). | `edof.write` — pièce sensible : `edof.sensitive` (sinon 422) |
| `POST` | `/api/v1/edof/dossiers/{dossier_id}/pieces/{requirement}/lien` | Rattache un document déjà déposé comme pièce EDOF. | `edof.write` — pièce sensible : `edof.sensitive` (sinon 422) |
| `GET` | `/api/v1/edof/documents-reutilisables` | Documents déjà déposés ailleurs, rattachables à un dossier (`dossier_id`). | `edof.read` — pièces sensibles masquées sans `edof.sensitive` |
| `POST` | `/api/v1/edof/pieces/{piece_id}/valider` | Valide une pièce EDOF. | `edof.validate` |
| `POST` | `/api/v1/edof/pieces/{piece_id}/rejeter` | Rejette une pièce EDOF avec motif. | `edof.validate` |
| `GET` | `/api/v1/edof/pieces/{piece_id}/contenu` | Télécharge le fichier d'une pièce EDOF. | `edof.read` — pièce sensible : `edof.sensitive` (403) |
| `POST` | `/api/v1/edof/dossiers/{dossier_id}/accompagnements` | Ajoute un accompagnement (webinaire, rendez-vous…) au dossier. | `edof.write` |
| `PATCH` | `/api/v1/edof/accompagnements/{accompaniment_id}` | Modifie un accompagnement. | `edof.write` |
| `POST` | `/api/v1/edof/complements/{complement_id}/clore` | Clôt (annule) une demande de complément. | `edof.write` |

### Documents professionnels (devis…)

Fichier : `backend/app/handler/editions.py` — 12 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/editions/types` | Types de documents (devis…), statuts et unités. | `documents.read` |
| `GET` | `/api/v1/editions` | Liste des documents professionnels ; filtres `entreprise` (id du client) et `type` (code de `GET /editions/types`, 422 si inconnu). | `documents.read` |
| `GET` | `/api/v1/editions/synthese` | Chiffres de l'accueil du module Documents. | `documents.read` |
| `GET` | `/api/v1/editions/formations` | Formations proposables dans un devis (tarif, durée). | `documents.read` |
| `GET` | `/api/v1/editions/clients` | Clients (entreprises) et complétude de l'adresse. | `documents.read` |
| `GET` | `/api/v1/editions/{project_id}` | Détail d'un document avec contrôles et capacités. | `documents.read` |
| `GET` | `/api/v1/editions/{project_id}/apercu` | Aperçu HTML imprimable (filigrane tant que non validé). | `documents.read` |
| `GET` | `/api/v1/editions/{project_id}/versions/{document_id}` | Version validée archivée (empreinte vérifiée). | `documents.read` |
| `POST` | `/api/v1/editions` | Crée un document (type, client, titre). | `documents.write` |
| `PATCH` | `/api/v1/editions/{project_id}` | Modifie titre, validité, sections d'un brouillon. | `documents.write` — brouillon seulement (`EditionPolicy`, refus 409) |
| `PUT` | `/api/v1/editions/{project_id}/lignes` | Remplace les lignes d'un devis (brouillon). | `documents.write` — brouillon seulement (`EditionPolicy`, refus 409) |
| `POST` | `/api/v1/editions/{project_id}/actions/{action}` | Circuit du document : `soumettre`, `renvoyer`, `valider`, `envoyer`, `reprendre`, `archiver`, `abandonner`. | `documents.read` — `documents.write` (soumettre, envoyer, reprendre, abandonner) ou `documents.validate` (renvoyer, valider, archiver) — `EditionPolicy`, refus 409 |

### Facturation : factures, avoirs, encaissements

Fichier : `backend/app/handler/invoicing.py` — 13 route(s). Module `invoicing` (**désactivé par défaut**, dépend de
`documents`). Montants en **centimes entiers** (`*_centimes`). Fondements réglementaires : `docs/facturation/SOURCES.md`.

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/factures/references` | Libellés : types, statuts, types de client, modes de paiement, unités. | `invoices.read` |
| `GET` | `/api/v1/factures` | Factures et avoirs (`type`, `statut`, `en_retard`, `q`), avec avoirs, encaissé, reste dû. | `invoices.read` |
| `GET` | `/api/v1/factures/synthese` | Chiffres de l'accueil : à encaisser, en retard, encaissé ce mois, alertes (échéances, trop-perçus). | `invoices.read` |
| `GET` | `/api/v1/factures/{id}` | Détail : lignes, TVA par taux, vérifications (`bloquant`, `fondement`), avoirs, encaissements, historique, capacités. | `invoices.read` |
| `GET` | `/api/v1/factures/{id}/apercu` | Brouillon : aperçu avec filigrane, sans numéro. Émise : pièce archivée (empreinte vérifiée, en-tête `X-Content-SHA256`). | `invoices.read` |
| `POST` | `/api/v1/factures` | Crée un brouillon : client (`ENTREPRISE`, `STAGIAIRE`, `FINANCEUR`), lignes reprises d'un devis validé (`devis_id`), d'inscriptions (`session_id`, `inscription_ids`) ou d'une source de financement. | `invoices.write` — refus 409 `CLIENT_MISSING`, `QUOTE_NOT_VALIDATED`, `QUOTE_OTHER_CLIENT`, `ENROLLMENT_NOT_IN_SESSION` |
| `PATCH` | `/api/v1/factures/{id}` | Modifie un brouillon (titre, coordonnées du client, bon de commande, période, échéance, note interne). | `invoices.write` — brouillon seulement (`NOT_DRAFT`, 409) |
| `PUT` | `/api/v1/factures/{id}/lignes` | Remplace les lignes (prix en centimes, remise, TVA ou `exoneree`) ; les totaux sont recalculés par l'API. | `invoices.write` — brouillon seulement |
| `DELETE` | `/api/v1/factures/{id}` | Supprime un brouillon (sans numéro : aucun trou). | `invoices.write` — brouillon seulement |
| `POST` | `/api/v1/factures/{id}/emettre` | Émet : numéro définitif `FA-AAAA-NNNN`, échéance, pièce HTML figée (SHA-256). | `invoices.issue` — `CHECKS_FAILED` (409, `details`) tant qu'une vérification bloquante reste |
| `POST` | `/api/v1/factures/{id}/avoirs` | Émet un avoir `AV-AAAA-NNNN` (`motif`, `lignes` : `ligne_id` + `montant_ht_centimes` ; vide = tout le restant). | `invoices.issue` — `NOT_AN_INVOICE`, `NOT_ISSUED`, `NOTHING_TO_CREDIT`, `CREDIT_EXCEEDS_REMAINING` (409) |
| `POST` | `/api/v1/factures/{id}/encaissements` | Enregistre un encaissement (`montant_centimes`, `recu_le`, `mode`, `reference`). | `payments.write` — `INVALID_STATE`, `PAYMENT_EXCEEDS_DUE` (409) ; date future 422 |
| `GET` | `/api/v1/encaissements` | Encaissements (`du`, `au`, `annules`). | `invoices.read` |
| `POST` | `/api/v1/encaissements/{id}/annulation` | Annule un encaissement avec motif (jamais effacé). | `payments.write` — `ALREADY_CANCELLED` (409) |

Circuit : brouillon → émise → payée partiellement / payée, ou annulée par avoir (avoirs égaux au total). Une pièce émise
ne se modifie plus : un déclencheur PostgreSQL le refuse aussi hors de l'API. Événements `invoice.*`, `credit_note.issued`,
`payment.*` (sans effet sur les preuves Qualiopi). Rôles : `financement` a les quatre droits, `gestion` lit et prépare.

### Émargement

Fichier : `backend/app/handler/attendance.py` — 7 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/sessions/{session_id}/creneaux` | Prépare les demi-journées de la session selon les réglages. | `attendance.write` — portée : sessions visibles seulement |
| `GET` | `/api/v1/sessions/{session_id}/emargement` | Feuille d'émargement de la session. | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement |
| `POST` | `/api/v1/creneaux/{slot_id}/code` | Émet le code de salle (QR) d'une demi-journée ; renouveler invalide l'ancien. | `attendance.write` — `AttendancePolicy` (portée, état), refus 409 |
| `POST` | `/api/v1/inscriptions/{enrollment_id}/lien-emargement` | Lien personnel d'émargement du stagiaire (affiché une fois). | `attendance.write` — portée : sessions visibles seulement |
| `PUT` | `/api/v1/creneaux/{slot_id}/presences/{enrollment_id}` | Constate présence ou absence d'un stagiaire. | `attendance.write` — `AttendancePolicy` (portée, état), refus 409 |
| `POST` | `/api/v1/creneaux/{slot_id}/validation` | Contre-validation de la demi-journée par le formateur. | `attendance.write` — `AttendancePolicy` (tous présents/absents constatés), refus 409 |
| `POST` | `/api/v1/emargement/signer` | Signature du stagiaire avec code de salle + jeton personnel. | Public — réglage `attendance.learner_self_sign`, fenêtre horaire ; limite de débit (429, §1) |

### Parcours du stagiaire

Fichier : `backend/app/handler/journey.py` — 9 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/sessions/{session_id}/parcours` | Stagiaires × étapes du parcours d'une session. | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement |
| `GET` | `/api/v1/parcours/synthese` | Chiffres de la vue d'ensemble « Parcours apprenant ». | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement |
| `GET` | `/api/v1/parcours/registres/{vue}` | Registre d'une étape toutes sessions visibles confondues. | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement |
| `GET` | `/api/v1/evaluations-acquis` | Évaluations des acquis (détail), attestation et résultat de certification par inscription, composés à partir des registres `evaluations`, `attestation`, `certification` ; filtres `session_id`, `programme`, `etat` (étape évaluations), `resultat` (`REUSSI`, `NON_REUSSI`, `EN_ATTENTE`, `AUCUN`). | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement ; filtre inconnu : 422 |
| `GET` | `/api/v1/inscriptions/{enrollment_id}/parcours` | Parcours d'un stagiaire avec capacités par étape. | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement |
| `POST` | `/api/v1/inscriptions/{enrollment_id}/parcours/{action}` | Exécute une étape du parcours (confirmer, convocation, attestation…). | `sessions.read` ou `sessions.read_own` — `enrollments.write` ou `learners.assess` selon l'étape (`JourneyPolicy`), refus 409 |
| `GET` | `/api/v1/inscriptions/{enrollment_id}/documents/{document_id}` | Document du stagiaire émis par le moteur (convocation, attestation). | `sessions.read` ou `sessions.read_own` — portée : sessions visibles seulement |
| `GET` | `/api/v1/parcours/adaptations` | Besoins d'adaptation (handicap) des sessions visibles. | `sessions.read` ou `sessions.read_own` — texte du besoin visible seulement avec `enrollments.write` ou `learners.assess` |
| `POST` | `/api/v1/inscriptions/{enrollment_id}/espace` | Génère le lien personnel de l'espace stagiaire (`{PUBLIC_URL}/espace/{jeton}`). | `enrollments.write` — portée : sessions visibles ; inscription non annulée |

### Financement

Fichier : `backend/app/handler/funding.py` — 9 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/financement/dispositifs` | Dispositifs de financement activés et leurs étapes. | `funding.read` |
| `GET` | `/api/v1/financement/regles` | Toutes les règles datées : `cle`, `description`, `valeurs[]` (`depuis`, `valeur`, `source`), `en_vigueur` à la date `le` (défaut : aujourd'hui ; `null` si aucune). | `funding.read` |
| `GET` | `/api/v1/financement/regles/{key}` | Valeur d'une règle datée à une date (`le`), avec sa source. | `funding.read` |
| `POST` | `/api/v1/inscriptions/{enrollment_id}/financement` | Ouvre le dossier de financement d'une inscription. | `funding.write` |
| `GET` | `/api/v1/inscriptions/{enrollment_id}/financement` | Dossier de financement d'une inscription, sources et capacités. | `funding.read` |
| `POST` | `/api/v1/financement/dossiers/{case_id}/sources` | Ajoute une source de financement (dispositif) au dossier. | `funding.write` |
| `POST` | `/api/v1/financement/sources/{source_id}/actions/{action}` | Action du circuit du dispositif (accepter, declarer_entree…). | `funding.write` — `FundingPolicy` : module du dispositif actif, état, conditions — refus 409 |
| `GET` | `/api/v1/financement/dossiers` | Tous les dossiers de financement (écran « Financeurs »). | `funding.read` |
| `GET` | `/api/v1/financement/echeances` | Échéances de financement sous `jours` jours. | `funding.read` |

### Ressources humaines

Fichier : `backend/app/handler/hr.py` — 8 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/rh/personnel` | Liste du personnel (`actifs`). | `staff.read` |
| `POST` | `/api/v1/rh/personnel` | Crée une fiche de personnel. | `staff.write` |
| `GET` | `/api/v1/rh/personnel/{staff_id}` | Fiche du personnel avec contrats et absences. | `staff.read` |
| `POST` | `/api/v1/rh/personnel/{staff_id}/contrats` | Ajoute un contrat. | `staff.write` |
| `POST` | `/api/v1/rh/personnel/{staff_id}/absences` | Ajoute une absence. | `staff.write` |
| `GET` | `/api/v1/rh/echeances` | Titres des formateurs expirés ou expirant sous `jours` jours (`titre_id`, formateur, type, libellé, fin, état). | `staff.read` |
| `POST` | `/api/v1/formateurs/{trainer_id}/titres` | Ajoute un titre ou une qualification à un formateur. | `trainers.write` |
| `PUT` | `/api/v1/formateurs/{trainer_id}/compte` | Relie un compte utilisateur à une fiche formateur. | `users.manage` |

### Communications et relances

Fichier : `backend/app/handler/relances.py` — 8 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/communications` | Messages (filtres statut, session), compteurs et état de l'envoi. | `communications.manage` |
| `GET` | `/api/v1/communications/regles` | Règles de relance chargées (`config/relances/standard.yaml`). | `communications.manage` |
| `GET` | `/api/v1/communications/{message_id}` | Détail d'un message. | `communications.manage` |
| `GET` | `/api/v1/communications/{message_id}/apercu` | Aperçu HTML du message tel qu'envoyé. | `communications.manage` |
| `POST` | `/api/v1/communications/{message_id}/valider` | Valide un message en attente avant envoi. | `communications.manage` |
| `POST` | `/api/v1/communications/{message_id}/annuler` | Annule un message (motif). | `communications.manage` |
| `POST` | `/api/v1/communications/{message_id}/renvoyer` | Relance l'envoi d'un message en échec. | `communications.manage` |
| `POST` | `/api/v1/communications/planifier` | Passage immédiat du planificateur et de l'envoi (date `le`). | `communications.manage` |

### Moteur IA et serveur MCP

Fichiers : `backend/app/handler/ia.py`, `backend/app/handler/mcp.py` (protocole), `backend/app/handler/mcp_outils.py` (outils),
`backend/app/application/service/ia/` (`session.py`, `espace.py`, `compte.py`, `weknora.py`) — 4 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/ia/session` | Session WeKnora du **compte navigateur** (contributeur de l'espace de l'organisme), **sans `refresh_token`** : le front rappelle cette route pour renouveler son jeton, ce qui revérifie le compte GSMS (actif, `ia.use`) ; désactiver un compte GSMS coupe donc l'assistant. Le compte de service (propriétaire de l'espace) reste côté serveur. Comptes créés au premier appel tant que l'inscription WeKnora est ouverte. Au passage, déclare le serveur MCP dans l'espace s'il ne l'est pas (idempotent) ; résultat dans `gsms_mcp` (`{ok, fait, a_regler}`), son échec n'empêche jamais la session. 503 si le moteur IA n'est pas configuré, injoignable, ou si un compte manque alors que l'inscription est fermée. | `ia.use` (rôles `admin`, `qualite`, `assistant_qualite`, `gestion`, `lecture` : ceux qui ont déjà `quality.read` et `sessions.read` ; pas `formateur`, `rh`, `financement`, `assistant_ia`) ; refusée (403) à un compte qui n'a pas toutes les permissions du compte technique, rôle personnalisé compris |
| `POST` | `/api/v1/ia/analyses` | Analyse d'un indicateur, contrat `gsms.ia.analyse-indicateur/2` : `{indicateur, question?, max_passages? (1-10), analyse_ia? (false)}`, tout autre champ refusé (422). Rend `moteur` (identique à `GET /qualiopi/indicateurs/{n}`), `recherche` (textes officiels de l'indicateur dans la version en vigueur et documents de l'organisme encore éligibles ; texte d'origine seulement, résumés générés écartés ; passages hors périmètre rejetés et comptés ; `REFERENCES_RETROUVEES`, `AUCUNE_REFERENCE` ou `ERREUR_TECHNIQUE`), et avec `analyse_ia` les `observations_ia` (contradiction, manque, incomplet, constat ; statut `PROPOSITION_IA`) et `propositions` (statut `PROPOSEE`) de l'assistant interne « Analyse documentaire (GSMS) », gardées seulement si elles citent des passages fournis ; `controles_non_executes`, `erreurs`, `validation_humaine` (`NON_DEMANDEE`, `EN_ATTENTE`, `DECIDEE`), `correlation_id`. Trace dans `qualite.ia_analyse` sans la question ni le texte des documents. Détail : `docs/AUDIT-TECHNIQUE-IA.md`. | `ia.use` + `quality.read` |
| `GET` | `/api/v1/ia/propositions?statut=&indicateur=` | Propositions d'action de l'IA (200 au plus) : action, justification, passages cités, statut, décision (qui, quand, motif). | `quality.read` |
| `POST` | `/api/v1/ia/propositions/{id}/decision` | `{decision: ACCEPTEE \| REJETEE, motif?}` (motif obligatoire pour un rejet). Définitive : 409 si déjà décidée. Accepter n'applique rien : l'action se crée ensuite dans GSMS par le circuit habituel. | `quality.write` |
| `GET` | `/api/v1/ia/analyses?indicateur=&limite=` | Traces des analyses, les plus récentes d'abord (200 au plus). | `journal.read` |
| `POST` | `/api/v1/mcp` | Serveur MCP (JSON-RPC 2.0, transport Streamable HTTP sans état, réponses JSON, sans `Mcp-Session-Id`) : `initialize`, `ping`, `tools/list`, `tools/call`, notifications (202). `server/discover` répond « méthode inconnue » (-32601), le client retombe sur `initialize`. | Jeton « mcp » du compte technique **ou** jeton utilisateur — chaque outil exige la permission de la route qu'il reprend |
| `GET` | `/api/v1/mcp` | 405 : pas de flux serveur (SSE). | — |
| `DELETE` | `/api/v1/mcp` | 405 : pas de session à fermer. | — |

**Outils MCP** (14, tous en lecture seule, annotés `readOnlyHint`) ; chacun appelle la fonction de la route HTTP indiquée,
sans rien recalculer, et exige la même permission qu'elle (quand la route en accepte plusieurs, l'une suffit, comme
`require_any`). Les listes sont limitées par `limite` (50 par défaut, 200 au plus) et renvoient `total` et `affiches` ; une
session ou une preuve se désigne par son identifiant ou sa référence, une formation par son identifiant, son code ou son slug
de catalogue.

| Outil | Arguments | Route reprise | Permission |
|---|---|---|---|
| `etat_indicateurs` | `du`, `au` | `GET /api/v1/qualiopi/readiness` | `quality.read` |
| `fiche_indicateur` | `numero` | `GET /api/v1/qualiopi/indicateurs/{n}` | `quality.read` |
| `lister_preuves` | `statut[]`, `type`, `indicateur`, `session`, `recherche`, `limite` | `GET /api/v1/qualiopi/preuves` | `quality.read` |
| `fiche_preuve` | `preuve` | `GET /api/v1/qualiopi/preuves/{id}` | `quality.read` |
| `lister_ecarts` | `statut[]` (défaut `OUVERT`, `EN_TRAITEMENT`), `indicateur`, `limite` | `GET /api/v1/qualiopi/constats` | `quality.read` |
| `lister_echeances` | `jours` (15), `responsable`, `limite` | `GET /api/v1/qualiopi/echeances` | `quality.read` |
| `lister_actions_correctives` | `statut`, `en_retard`, `limite` | `GET /api/v1/qualiopi/actions` | `quality.read` |
| `synthese_session` | `session` | `GET /api/v1/sessions/{id}/dossier` | `quality.read` |
| `fiche_formation` | `formation` (identifiant, code ou slug) | `GET /api/v1/qualiopi/formations/{id}` | `quality.read` |
| `lister_sessions` | `statut`, `du`, `au`, `limite` | `GET /api/v1/sessions` | `sessions.read` ou `sessions.read_own` |
| `planning` | `du`, `au`, `formateur`, `lieu`, `programme`, `annulees` | `GET /api/v1/planning` | `sessions.read` ou `sessions.read_own` |
| `lister_audits` | `limite` | `GET /api/v1/qualiopi/audits` | `quality.read` |
| `lister_veille` | `limite` (la route n'a pas de filtre de domaine) | `GET /api/v1/watch-items` | `sessions.read` ou `quality.read` |
| `lister_reclamations` | `limite` | `GET /api/v1/complaints` | `sessions.read` ou `quality.read` |

Un droit manquant, un module éteint, un objet introuvable ou un argument invalide donnent un résultat d'outil `isError: true`
avec le motif en français (les messages des routes).

**Authentification du serveur MCP.** Le back-office partage un seul compte de service WeKnora : il n'y a donc pas d'utilisateur
GSMS derrière chaque appel de l'assistant. Le moteur IA présente un jeton « mcp » (`Authorization: Bearer`, stocké chiffré par
WeKnora) émis pour le **compte technique** `assistant-ia@gsms.local` (`IA_COMPTE_TECHNIQUE_EMAIL`), rôle système
`assistant_ia` = les permissions `quality.read` et `sessions.read` (lecture de l'état Qualiopi et du planning ; depuis le 26/10/2026, pour les questions de planning). Ce compte a un mot de passe aléatoire jamais communiqué (aucune connexion
possible) ; ses rôles se voient et se changent dans la gestion des comptes. Le jeton « mcp » ne périme pas mais n'ouvre aucune
autre route (401) ; il est lié à l'empreinte du mot de passe du compte : `ia-preparer --renouveler-jeton` l'invalide et
dépose le nouveau, désactiver le compte coupe l'accès aussitôt. Un utilisateur GSMS peut aussi appeler `/api/v1/mcp` avec son
propre jeton de connexion : il a alors ses propres droits. Une instance GSMS sert un seul organisme, et l'espace WeKnora est
celui du compte de service de cet organisme. Un en-tête `Origin` inconnu de `CORS_ORIGINS` est refusé (403). Le jeton « mcp » n'est accepté qu'en appel direct sur le réseau interne : une requête passée par un proxy (`X-Forwarded-For` ou `Forwarded`) doit porter un jeton utilisateur, et `deploy/Caddyfile` ne publie pas `/api/v1/mcp` (404). Ainsi un jeton « mcp » détourné (par exemple en changeant l'adresse du service dans l'écran WeKnora) ne sert à rien depuis l'extérieur ; l'adresse est en outre remise à `IA_MCP_URL` à chaque ouverture de session. Aucun outil n'écrit (chaque appel se termine par un `rollback`) ; le serveur ne journalise ni les arguments ni les réponses. Les réponses sont celles des routes HTTP lues avec `quality.read` : pas d'adresse e-mail, de téléphone ni d'adresse postale, mais les noms des stagiaires et formateurs concernés par une pièce manquante y figurent (ils désignent ce qui est à faire).

**Comptes WeKnora.** Pour que le navigateur ne détienne jamais l'administration de l'espace :
le **compte de service** (`WEKNORA_SERVICE_EMAIL`), propriétaire de l'espace, utilisé seulement par l'API (serveur MCP,
bases de connaissances, membres, invitations) ; et **un compte WeKnora par compte GSMS** (`<service>+u-<empreinte>@<domaine>`,
empreinte dérivée de l'identifiant GSMS, mot de passe dérivé du mot de passe de service, jamais stocké), membre
**contributeur** de l'espace : il lit les bases, les services MCP et les modèles, crée ses propres bases et agents, discute,
mais ne peut ni régler les modèles, ni déclarer de service MCP (403 vérifié contre le moteur), ni gérer les membres.
WeKnora range les conversations par compte : chacun ne voit que les siennes (vérifié contre le moteur : liste et lecture par
identifiant, 404). Le compte est créé à la première session IA de la personne, par une **invitation** « contributeur » que le
compte de service émet puis **révoque aussitôt**, même en cas d'échec (un lien d'invitation WeKnora accepte sinon plusieurs
inscriptions jusqu'à son expiration). Régler les modèles du moteur IA demande toujours le compte de service : point ouvert.
L'ancien compte partagé `<service>+navigateur@…` n'est plus utilisé ; ses conversations restent dans le moteur.

**Inscription.** `ia/config/config.yaml` règle `auth.registration_mode: invite_register` : inscription libre fermée, comptes
créés seulement par invitation. `DISABLE_REGISTRATION` doit rester à `false` dans `ia/.env` (à `true`, il force `invite_only`,
qui bloque les invitations, et l'API répond 503). **Première installation** : le compte de service doit pouvoir s'inscrire
une fois. Mettre `registration_mode: self_serve`, `docker compose up -d ia-app`, lancer `python -m app.cmd.cli ia-preparer`,
puis remettre `invite_register` et relancer `ia-app`.

**Préparation de l'espace WeKnora** : `python -m app.cmd.cli ia-preparer [--renouveler-jeton]` (idempotent) déclare le
serveur MCP « Moteur Qualiopi (GSMS) » (`http-streamable`, `IA_MCP_URL`, défaut `http://api:8000/api/v1/mcp`, adresse vue
depuis le conteneur `ia-app` ; le moteur doit autoriser l'hôte `api`, `SSRF_WHITELIST_EXTRA: api` dans `docker-compose.yml`)
et la base de connaissances « Référentiel Qualiopi » : un document par fichier `backend/referentials/qualiopi/v9|v10/source/*.md`
(65 textes officiels ; aucun guide de lecture n'est livré dans le dépôt). Un document déjà présent (même titre) est laissé
tel quel ; un document en échec d'indexation est renvoyé à l'indexation dès que la base a un modèle d'embedding. La commande
dit ce qui manque (aucun modèle d'embedding, base sans modèle, documents refusés ou en échec) et sort en code 1 dans ce cas.

### Préinscriptions (formulaire du site)

Fichiers : `backend/app/handler/preinscriptions.py`, `backend/app/application/access/preinscriptions.py`,
`backend/app/application/service/preinscriptions/` — 5 route(s). Table `formation.preinscription` (migration `0021`),
référence `PRE-000001`, statuts `NOUVELLE`, `EN_COURS`, `CONVERTIE`, `REFUSEE` (motif). Journal des modifications et
événements outbox `preinscription.received`, `preinscription.status_changed`, `preinscription.converted` (sans effet sur
les preuves Qualiopi ; la conversion publie aussi `learner.enrolled`).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/public/preinscriptions` | Demande envoyée par le formulaire de la landing (`landing/app/preinscription.tsx`, mêmes noms de champs : identité, coordonnées, formation et session souhaitées, financement, situation, 6 déclarations, `sourceContext`). 201 `{message}`. Refus : `{error, detail, message, details?}` (`message` affiché par le formulaire) — 400 illisible, 413 au-delà de 16 Kio, 422 champ invalide (champs inconnus refusés, tailles bornées, déclarations toutes cochées), 429 au-delà de 5 envois valides en 10 min par origine. Même e-mail et même formation encore ouverte depuis moins de 24 h : pas de seconde demande, même réponse 201. Déclarations conservées avec leur horodatage (`consented_at`) ; formation reconnue par `catalog_slug`. | Public — limite de débit en mémoire du processus, aucune donnée personnelle journalisée |
| `GET` | `/api/v1/preinscriptions` | Liste, plus récentes d'abord : `statut` (répétable), `formation` (slug ou id), `recherche` (référence, nom, e-mail, téléphone, ville), `limite` (100, 500 au plus) ; renvoie `total`, `compteurs` par statut, `statuts`, `demandes`. | `leads.read` |
| `GET` | `/api/v1/preinscriptions/{id}` | Détail : identité, naissance, adresse, déclarations (`declarations_le`), motif de refus, conversion, `stagiaire_existant` (même e-mail), `sessions_proposees` (sessions inscriptibles de la formation, avec la décision `inscription` de `TrainingPolicy`), `capabilities` (`EN_COURS`, `REFUSEE`, `convertir`). | `leads.read` |
| `POST` | `/api/v1/preinscriptions/{id}/statut` | `{statut, motif}` : `EN_COURS` (prise en charge, ou réouverture d'un refus) ou `REFUSEE` (motif obligatoire, sinon 422). | `leads.write` — 409 `INVALID_TRANSITION` / `UNKNOWN_STATUS` (`CONVERTIE` passe par la conversion) |
| `POST` | `/api/v1/preinscriptions/{id}/conversion` | `{session_id?}` : stagiaire repris s'il existe sous le même e-mail, sinon créé (schéma `PersonIn` des apprenants), puis inscription à la session par `training.service.enroll`. Renvoie le détail + `resultat` (`stagiaire_id`, `stagiaire_existant`, `inscription_id`, `session_id`). | `leads.write` — 409 `CONVERSION_IMPOSSIBLE` avec `details` [{code, message}] : `PERMISSION_MISSING` (`sessions.write`), `INVALID_TRANSITION`, refus d'inscription de la session (`ENROLLMENT_CLOSED`, `CAPACITY_REACHED`…), `ALREADY_ENROLLED` |

### Formulaire de contact du site

Fichiers : `backend/app/handler/contact.py`, `backend/app/application/service/relances/contact.py`, modèle
`config/emails/contact_site.html` — 1 route. Pas de table : le message devient un e-mail interne du journal des
communications (`communication.message`, règle `contact_site`, statut `PREVU`, parti au prochain passage du worker, même
module `relances` désactivé) pour chaque compte actif ayant `leads.read` (hors direction si d'autres existent) ; sans
destinataire, `SANS_ADRESSE`. Visible dans « Communication › Messages et relances ».

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `POST` | `/api/v1/public/contact` | Message du formulaire de contact de la landing (`landing/app/widgets.tsx`) : `{name, email, subject, message, _trap}`. 201 `{message}`. Refus `{error, detail, message, details?}` : 400 illisible, 413 au-delà de 16 Kio, 422 champ invalide (champs inconnus refusés ; nom 2-200, objet 5-200, message 10-5 000 caractères, e-mail), 429 au-delà de 5 messages valides en 10 min par origine. Champ caché `_trap` rempli : même 201, rien n'est transmis. Même message renvoyé : un seul e-mail par destinataire. | Public — limite de débit en mémoire du processus, aucune donnée personnelle journalisée |

### Routes publiques (lien signé)

Fichier : `backend/app/handler/questionnaires.py` — 4 route(s).

| Méthode | Chemin | Rôle | Droits requis |
|---|---|---|---|
| `GET` | `/api/v1/public/questionnaires/{token}` | Questionnaire d'un stagiaire ouvert par lien signé (date d'ouverture enregistrée). | Public — jeton HMAC signé avec `JWT_SECRET` |
| `POST` | `/api/v1/public/questionnaires/{token}` | Enregistre les réponses (`{"reponses": {...}}`), réponse unique. | Public — jeton HMAC signé avec `JWT_SECRET` ; limite de débit |
| `GET` | `/api/v1/public/documents/{token}` | Convocation ou attestation du stagiaire (fichier figé, empreinte vérifiée). | Public — jeton HMAC daté, clé dérivée (410 une fois expiré) ; limite de débit |
| `GET` | `/api/v1/public/espace/{token}` | Espace du stagiaire : formation, à faire, documents (fermé après la session + délai). | Public — jeton HMAC signé avec `JWT_SECRET` |

## 3. Entités de paramétrage

Inventaire de ce qui se règle (ou devrait se régler) dans un futur panneau **Paramètres** façon WeKnora. Pour chaque
entité : où elle vit, ses champs principaux, les routes qui la lisent ou la modifient, et la section du panneau proposée.
« Fichier seulement » = aucune route ne l'écrit ; on la change en livrant une nouvelle version du fichier (ou par la CLI
`python -m app.cmd.cli …`).

Sections proposées pour le panneau : **Organisme**, **Équipe et accès**, **Modules**, **Réglages**, **Référentiel qualité**,
**Preuves et dossiers**, **Échéancier**, **Communications**, **Questionnaires**, **Financement**, **EDOF**, **Documents et modèles**,
**Moyens et partenaires**, **Listes de valeurs**, **Déploiement** (lecture seule).

### 3.1 Organisme et plateforme

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 1 | Organisme (identité réglementaire) | table `formation.organization` (`training.models.Organization`) | `name`, `nda_number`, `siret`, `action_categories` (AF, BC, VAE, APPRENTISSAGE), `is_new_entrant`, `disability_referent_name/email`, `mobility_referent_name` | `GET /api/v1/organisme` (authentifié), `PATCH /api/v1/organisme` (`settings.manage`, relance le moteur) ; résumé dans `GET /api/v1/bootstrap` | Organisme |
| 2 | Modules (fonctionnalités) | code `app/application/service/platform/features.py` (`FEATURES`, 15 modules dont 3 non construits) + table `config.feature_state` (`feature`, `enabled`) + variable `FEATURES_AVAILABLE` | `code`, `label`, `default`, `depends_on`, `built` ; état `enabled` | `GET /api/v1/features` (authentifié), `PUT /api/v1/features/{code}` (`settings.manage`) | Modules |
| 3 | Réglages datés | déclarations `SettingDef` par domaine (`platform/general.py`, `training/settings.py`, `attendance/settings.py`, `qualiopi/settings.py`, `relances/settings.py`, `editions/settings.py`) + table `config.setting_value` (ajout seul) | `key`, `value` (JSON validé par type), `effective_from` (jamais dans le passé), `reason` (obligatoire si `regulatory`) | `GET /api/v1/settings`, `GET /api/v1/settings/{key}/history`, `PUT /api/v1/settings/{key}` (tous `settings.manage`) | Réglages (un onglet par domaine) |

Les 34 réglages déclarés (clé — libellé — module — réglementaire) :

| Domaine | Clé | Libellé | Module | Motif exigé |
|---|---|---|---|---|
| general | `general.timezone` | Fuseau horaire | core | non |
| general | `general.language` | Langue des documents (seulement `fr`) | core | non |
| general | `general.brand_color` | Couleur principale de l'interface | core | non |
| general | `general.brand_short_name` | Nom court affiché | core | non |
| training | `training.close_requires_trainer_validation` | Clôture : demi-journées validées par le formateur | training | oui |
| training | `training.close_requires_certificates` | Clôture : attestations remises | training | oui |
| journey | `journey.confirm_requires_agreement` | Confirmation : convention signée exigée | training | non |
| journey | `journey.certificate_requires_assessment` | Attestation : au moins une évaluation des acquis | training | oui |
| journey | `journey.cold_survey_min_days` | Satisfaction à froid : jours minimum après la fin | training | non |
| attendance | `attendance.slots` | Demi-journées et horaires | attendance | non |
| attendance | `attendance.weekdays` | Jours de formation | attendance | non |
| attendance | `attendance.sign_before_minutes` | Signature possible avant le créneau (min) | attendance | non |
| attendance | `attendance.sign_after_minutes` | Signature possible après le créneau (min) | attendance | non |
| attendance | `attendance.learner_self_sign` | Les stagiaires signent eux-mêmes | attendance | oui |
| quality | `quality.allow_self_validation` | Le déposant peut valider sa propre pièce | qualiopi | oui |
| relances | `relances.validation_externe` | Validation avant envoi des messages externes | relances | non |
| relances | `relances.adresse_reponse` | Adresse de réponse des messages | relances | non |
| relances | `relances.rattrapage_jours` | Rattrapage des messages en retard (jours) | relances | non |
| relances | `relances.regles_desactivees` | Règles de relance désactivées | relances | non |
| documents | `documents.adresse` | Adresse postale (en-tête) | documents | non |
| documents | `documents.telephone` | Téléphone | documents | non |
| documents | `documents.email` | E-mail commercial | documents | non |
| documents | `documents.site_web` | Site internet | documents | non |
| documents | `documents.tva_regime` | Régime de TVA | documents | oui |
| documents | `documents.tva_taux` | Taux de TVA (%) | documents | non |
| documents | `documents.devis_validite_jours` | Validité d'un devis (jours) | documents | non |
| documents | `documents.conditions_paiement` | Conditions de paiement | documents | non |
| documents | `documents.mentions` | Mentions complémentaires | documents | non |
| facturation | `facturation.delai_paiement_jours` | Délai de paiement (jours, défaut 30) | invoicing | non |
| facturation | `facturation.taux_penalites` | Taux des pénalités de retard (défaut : BCE + 10 points) | invoicing | non |
| facturation | `facturation.escompte` | Conditions d'escompte (défaut : néant) | invoicing | non |
| facturation | `facturation.forme_juridique` | Forme juridique et capital | invoicing | non |
| facturation | `facturation.numero_tva` | N° de TVA intracommunautaire | invoicing | non |
| facturation | `facturation.coordonnees_bancaires` | IBAN, BIC imprimés | invoicing | non |

`GET /api/v1/settings` renvoie pour chacun le `schema` JSON (issu du type Pydantic) : le panneau peut générer ses champs
de formulaire à partir de ce schéma plutôt que de les coder en dur.

### 3.2 Utilisateurs, rôles et permissions

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 4 | Utilisateurs | tables `iam.user`, `iam.user_role` (`auth.models`) | `email`, `full_name`, `password_hash`, `is_active`, rôles | `GET/POST /api/v1/auth/users`, `PUT …/{user_id}/roles`, `PUT …/{user_id}/active` (`users.manage`) ; `GET/PATCH /api/v1/auth/me`, `POST /api/v1/auth/me/password`, `POST /api/v1/auth/me/deconnexion-partout` (soi-même) ; `token_version` sert à la révocation des jetons, jamais exposé. Création du premier admin : CLI `create-admin` | Équipe et accès › Comptes |
| 5 | Rôles | rôles système dans le code (`SYSTEM_ROLES`, 9 rôles, dont `assistant_ia`, compte technique du serveur MCP) + rôles personnalisés en table `iam.role` | `code`, `label`, `description`, `permissions` (liste de codes) | `GET /api/v1/auth/roles` (authentifié) ; `POST`, `PUT /{code}`, `DELETE /{code}` (`users.manage`, rôles personnalisés seulement, anti-escalade) | Équipe et accès › Rôles |
| 6 | Catalogue des permissions | code `app/router/rbac.py` (`CATALOGUE`, 27 permissions) | `code`, `label`, `feature` | `GET /api/v1/auth/permissions` (lecture seule) | Équipe et accès › Rôles (cases à cocher groupées par module) |
| 7 | Liaison compte ↔ formateur / personnel | colonnes `formation.trainer.user_id`, `rh.staff_member.user_id` | compte relié (donne la portée `sessions.read_own`) | `PUT /api/v1/formateurs/{trainer_id}/compte` (`users.manage`) ; `POST /api/v1/rh/personnel` (`staff.write`) | Équipe et accès › Comptes |

### 3.3 Référentiel qualité (Qualiopi V9 / V10)

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 8 | Versions du référentiel | fichiers `backend/referentials/qualiopi/v9/` (en vigueur au 08/01/2024, 32 indicateurs, 29 contrôles) et `v10/` (au 01/11/2026, 33 indicateurs, 31 contrôles) : `normative/vN.yaml` + `source/*.md` (textes officiels) ; importés dans `qualite.referential_version` | `code`, `version`, `title`, `effective_from`, `source_label`, `source_url`, `source_sha256`, `normative_sha256`, `upstream_ref`, `is_active`, `imported_at` | `GET /api/v1/referentials`, `GET …/active` (`quality.read`) ; `POST /api/v1/referentials/import` (`referential.manage`) ; CLI `import-referential` | Référentiel qualité › Versions |
| 9 | Critères | YAML (`criteria:`) → table `qualite.criterion` | `version_id`, `number`, `title` | `GET /api/v1/qualiopi/criteres`, `GET /api/v1/referentials/active` (lecture) ; écriture par import seulement | Référentiel qualité › Critères |
| 10 | Indicateurs | YAML (`indicators:`) → tables `qualite.indicator`, `qualite.indicator_text` | `number`, `criterion_number`, `title`, `scope`, `ponderation`, `new_entrant_adapted`, `subcontracting`, `applicability` (par catégorie d'action), `expected_evidence`, `human_review`, `editorial_note` ; textes (`section`, `body`) | `GET /api/v1/referentials/active/indicators[/{number}]`, `GET /api/v1/qualiopi/indicateurs/{number}` (`quality.read`) ; écriture par import seulement | Référentiel qualité › Indicateurs |
| 11 | Contrôles du moteur | YAML (`controls:` par indicateur, `new_entrant_control`) → table `qualite.control_definition` ; fonctions de contrôle dans `app/application/service/qualiopi/evaluation/checks.py` (`CHECKS` : `per_enrollment_evidence`, `session_evidence`, `attendance_tracking`, `program_evidence`, `org_evidence`, `trainer_qualification`, `subcontractors`, `complaints`, `required_documents`…) | `key`, `control_version`, `label`, `check`, `scope`, `params`, `severity` (majeure / mineure), `remediation`, `guide_section`, `new_entrant_mode` | lus dans `GET /api/v1/referentials/active/indicators/{number}` ; aucune route d'écriture (import seulement) | Référentiel qualité › Contrôles (lecture seule) |
| 12 | Noms d'affichage critères / indicateurs | fichier `backend/config/qualiopi/nomenclature.yaml` | `criteres.{n}.nom`, plage d'indicateurs ; `indicateurs.{n}` (nom court) | lus dans les vues indicateurs (`short_title`, `criterion_name`) ; fichier seulement | Référentiel qualité › Libellés |
| 13 | Cycles de certification | table `qualite.certification_cycle` | `label`, `kind` (INITIAL, SURVEILLANCE, RENOUVELLEMENT, INTERNE), `period_start`, `period_end`, `audit_on`, `certifier`, `notes` | `GET`/`POST /api/v1/qualiopi/cycles` (`quality.read` / `quality.write`) ; pas de modification ni suppression | Référentiel qualité › Cycles et audits |

### 3.4 Règles de preuves et dossiers

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 14 | Types de preuve | code `app/application/service/qualiopi/labels.py` (`EVIDENCE_TYPES`, 31 codes : AGREEMENT, ATTENDANCE, PUBLIC_INFO…) | code → libellé | aucune route dédiée (libellés renvoyés dans les vues preuves) ; code seulement | Preuves et dossiers › Types de preuve (lecture seule) |
| 15 | Dossiers de pièces attendues et grilles de relecture | fichier `backend/config/dossiers/standard.yaml` (ORGANISME : 7 pièces, FORMATEUR : 2 pièces) + trames `config/dossiers/modeles/*.md` | par pièce : `code`, `label`, `evidence`, `indicators`, `validity_days`, `required`, `modele`, `grille[]` (`code`, `question`, `exigence` REFERENTIEL / REGLEMENTAIRE / GSMS, `source`, `condition`) | `GET /api/v1/dossiers/{subject}/{subject_id}`, `GET /api/v1/dossiers/{subject}/modeles/{requirement}` (`quality.read`) ; fichier seulement | Preuves et dossiers › Pièces attendues |
| 16 | Règle d'auto-validation des preuves | réglage `quality.allow_self_validation` (voir 3.1) | booléen daté, motif obligatoire | `PUT /api/v1/settings/quality.allow_self_validation` | Preuves et dossiers › Validation |
| 17 | Circuit de session (jalons de l'échéancier) | fichier `backend/config/circuits/standard.yaml` (8 jalons, J-15 → J+45) ; état calculé en `qualite.milestone_status` | `key`, `label`, `anchor` (start / end), `offset_days`, `warn_days`, `evidence`, `facts`, `enrollments`, `owner` | lu en clair via `GET /api/v1/qualiopi/circuit` ; appliqué dans `GET /api/v1/qualiopi/echeances`, `GET /api/v1/pilotage/feuille-de-route` ; modifiable dans le fichier seulement | Échéancier |

### 3.5 Communications et questionnaires

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 18 | Règles de relance (délais) | fichier `backend/config/relances/standard.yaml` (12 règles), validé par `app/application/service/relances/rules.py` ; désactivation par le réglage `relances.regles_desactivees` | `cle`, `libelle`, `portee` (INSCRIPTION, SESSION, JALON, HEBDO), `destinataire`, `ancre` (debut / fin), `decalages` (jours, négatif = avant), `jour`, `condition`, `modele`, `externe`, `indicateurs`, `questionnaire`, `document` | `GET /api/v1/communications/regles` (`communications.manage`, lecture) ; activation via `PUT /api/v1/settings/relances.regles_desactivees` ; le fichier n'est pas modifiable par l'API | Communications › Règles |
| 19 | Modèles d'e-mails | fichiers `backend/config/emails/*.html` (Jinja) + registre versionné `TEMPLATES` dans `app/application/service/relances/render.py` (8 modèles : `convention_a_signer`, `rappel_session`, `recapitulatif_formateur`, `evaluations_manquantes`, `alerte_jalon`, `questionnaire`, `document_disponible`, `synthese_qualite`) | `version`, `sujet` (gabarit), `pourquoi` | aperçu d'un message via `GET /api/v1/communications/{id}/apercu` ; aucune route de lecture ou d'édition des modèles | Communications › Modèles |
| 20 | Paramètres d'envoi | réglages `relances.validation_externe`, `relances.adresse_reponse`, `relances.rattrapage_jours` + variables `SMTP_*` | voir 3.1 et 3.8 | `PUT /api/v1/settings/{key}` ; SMTP : environnement seulement | Communications › Envoi |
| 21 | Questionnaires | fichiers `backend/config/questionnaires/*.yaml` (`BESOIN_POSITIONNEMENT`, `SATISFACTION_CHAUD`, `SATISFACTION_FROID`, `ENTREPRISE_FROID`, tous en version 1) ; invitations en `communication.questionnaire_invitation` | `code`, `version`, `titre`, `introduction`, `questions[]` (`id`, `libelle`, `type` texte / choix / note / oui_non, `requis`, `options`, `aide`, `si`) | lus seulement par les routes publiques `GET/POST /api/v1/public/questionnaires/{token}` ; aucune route d'administration | Questionnaires |

### 3.6 Financement et EDOF

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 22 | Dispositifs de financement (circuits) | fichier `backend/config/financement/dispositifs.yaml` (version 2026-09-29 : CPF, OPCO, FRANCE_TRAVAIL, ENTREPRISE, PERSONNEL) ; activés par les modules `funding`, `funding.cpf`, `funding.opco`, `funding.france_travail` | `label`, `feature`, `provider`, `payer`, `prorata`, `initial`, `final`, `states`, `actions` (`from`, `to`, `requires`, `due`, `portal`, `label`), `pieces` | `GET /api/v1/financement/dispositifs` (`funding.read`, lecture) ; fichier seulement | Financement › Dispositifs |
| 23 | Règles datées du financement | fichier `backend/config/financement/regles.yaml` (`cpf.participation_titulaire_eur`, `personnel.delai_retractation_jours`, `personnel.acompte_max_pourcent`) | `description`, `values[]` (`from`, `value`, `source`) | `GET /api/v1/financement/regles?le=` (liste) et `GET /api/v1/financement/regles/{key}?le=` (`funding.read`) ; modifiable dans le fichier seulement | Financement › Règles réglementaires (lecture seule) |
| 24 | Référentiel des pièces EDOF | fichier `backend/config/edof/referencement.yaml` (version 2026-10-02, 25 pièces) chargé par `app/application/service/edof/requirements.py` | `version`, `sources`, `pieces[]` (`code`, `label`, `scope` ETABLISSEMENT / FORMATION, `stage`, `when`, `group`, `max_age_days`, `expires`, `siret`, `sensitive`, `generated`, `provided_by`) | `GET /api/v1/edof/referentiel` (`edof.read`) ; fichier seulement | EDOF › Pièces exigées |
| 25 | Profil EDOF de l'établissement | table `edof.establishment` (créée à la première lecture) ; amorçage possible par `config/edof/formssi.yaml` (CLI `import-formssi`) | `legal_name`, `legal_form`, `structure_type`, `address`, `naf_code`, représentant, `qualiopi_certificate/certifier/valid_until/categories`, `efp_connect_status`, dates de vérification, `cgu_version_read`, `uses_subcontracting`, `note` | `GET`/`PATCH /api/v1/edof/etablissement` (`edof.read` / `edof.write`, vérifications : `edof.validate`) | EDOF › Établissement (ou Organisme) |

### 3.7 Documents, moyens et listes de valeurs

| # | Entité | Où elle vit | Champs principaux | Routes | Section |
|---|---|---|---|---|---|
| 26 | Modèles de documents | fichiers `backend/config/documents_generes/` (convocation, attestation de fin, programme, `_base.html`), `config/documents_pro/` (devis, facture et avoir, `_base_a4.html`), `config/qualiopi/carnet.html`, logo `config/organisme/logo.png` ; coordonnées imprimées via les réglages `documents.*` | gabarits Jinja HTML | rendus par `GET /api/v1/fiches/{id}/versions/{vid}/programme`, `GET /api/v1/editions/{id}/apercu`, `GET /api/v1/qualiopi/carnet/impression`, documents du parcours ; aucune route d'édition (le logo n'est pas téléversable) | Documents et modèles |
| 27 | Moyens et partenaires de l'organisme | tables `formation.premises`, `formation.equipment`, `formation.subcontractor`, `formation.partner`, `formation.watch_item` | lieux (`code`, `name`, `kind`, `parent_id`, `capacity`, `accessibility`, `status`…), équipements (`category`, `quantity`, `regulatory_ref`, `next_check_on`…), sous-traitants (`siret`, `qualiopi_certified`, `contract_signed_on`), partenaires (`kind` HANDICAP / SOCIO_ECONOMIQUE), veille (`domain` LEGALE / METIERS / PEDAGOGIQUE) | CRUD `/api/v1/premises`, `/equipment` (écriture `sessions.write`), `/subcontractors`, `/partners`, `/watch-items` (écriture `quality.write`) ; lecture `sessions.read` ou `quality.read` | Moyens et partenaires |
| 28 | Listes de valeurs codées | constantes dans `app/types/training.py` (`TRACKS`, `PATHWAYS`, `DELIVERY_MODES`, `CERTIFICATION_BASES`, `HABILITATIONS`, `PROGRAM_TRAINER_ROLES`, `RESOURCE_*`, `QUALIFICATION_KINDS`, `PREMISES_KINDS`, `PLACE_STATUSES`, `EQUIPMENT_CATEGORIES`, `SURVEY_AUDIENCES`…), `app/types/edof.py`, `app/types/hr.py` (`STAFF_KINDS`, `CONTRACT_KINDS`, `ABSENCE_KINDS`), `app/types/editions.py` (`KINDS`, `STATUSES`, `UNITS`), `ACTION_CATEGORIES` (`platform/router.py`) | code → libellé | certaines exposées en lecture (`GET /api/v1/listes-de-valeurs` : lieux, équipements, partenaires, veille, réclamations, publics d'enquête, titres ; `GET /api/v1/fiches/{id}` : `certification_bases`, `habilitations`… ; `GET /api/v1/editions/types` ; `GET /api/v1/organisme` : `categories_possibles`) ; code seulement | Listes de valeurs (lecture seule) |
| 29 | Configuration de déploiement | variables d'environnement lues par `app/config/config.py` (`Settings`) | `APP_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_TTL_MINUTES`, `CORS_ORIGINS`, `REFERENTIALS_DIR`, `DOCUMENTS_DIR`, `FEATURES_AVAILABLE`, `SMTP_HOST/PORT/USER/PASSWORD/STARTTLS/SSL/FROM`, `PUBLIC_URL`, `WEKNORA_URL`, `WEKNORA_SERVICE_EMAIL/PASSWORD`, `IA_MCP_URL`, `IA_COMPTE_TECHNIQUE_EMAIL` | aucune route (seul `FEATURES_AVAILABLE` se voit indirectement par `available` dans `GET /api/v1/features`) | Déploiement (informatif, hors panneau) |
| 30 | Données d'amorçage | `backend/config/catalogue/gsms-school.yaml` (offre, lieux, équipements), `backend/config/edof/formssi.yaml` + `formssi-tfp-aps-modules.json`, données de démonstration (`app/application/service/demo.py`) | — | aucune route : CLI `import-gsms-school`, `import-formssi`, `seed-demo`, `retirer-demo` | hors panneau (outil d'installation) |

## 4. Points d'attention pour le nouveau front

1. **Préfixe** : toutes les routes métier sont sous `/api/v1` (le proxy n'ajoute ni ne retire rien). Le front appelle donc
   `https://<domaine>/api/v1/...` s'il partage le domaine de l'API, ou l'URL de l'API sinon.
2. **CORS_ORIGINS** : si le front appelle l'API depuis le navigateur sur une autre origine, l'ajouter à `CORS_ORIGINS`
   (`*` est refusé en production). Seuls les en-têtes `Authorization` et `Content-Type` sont autorisés, et aucun
   `expose_headers` n'est déclaré : en appel cross-origin, le JavaScript **ne peut pas lire `Content-Disposition` ni
   `X-Content-SHA256`** des téléchargements. Même origine (ou relais côté serveur, comme l'ancien front Next) : pas de souci.
3. **Jeton** : Bearer uniquement, durée 12 h par défaut, pas de refresh. Prévoir la redirection vers la connexion sur 401.
   Ne pas exposer le jeton au JavaScript si possible (l'ancien front le gardait en cookie httpOnly derrière un relais).
4. **PUBLIC_URL** sert à fabriquer les liens des e-mails et de l'espace stagiaire. Le nouveau front doit fournir, à cette adresse :
   - la page **`/q/{jeton}`** (questionnaire : `GET`/`POST /api/v1/public/questionnaires/{jeton}`, réponses `{"reponses": {...}}`) ;
   - la page **`/espace/{jeton}`** (espace stagiaire : `GET /api/v1/public/espace/{jeton}`) ;
   - le chemin **`/api/public/documents/{jeton}`** qui doit renvoyer vers `GET /api/v1/public/documents/{jeton}` (relais ou
     règle de proxy) : les liens déjà envoyés par e-mail pointent sur ce chemin, **sans `v1`** ;
   - la page **`/emarger`** (lecture de `?code=` du QR de salle et `?jeton=` du lien personnel, puis
     `POST /api/v1/emargement/signer` avec `{code, jeton}`). Ce lien est renvoyé en chemin relatif, sans `PUBLIC_URL`.
   - ces trois pages sont faites (`app/src/views/gsms/public/`, voir §1 « Pages publiques par lien signé ») ;
   - le formulaire de contact de la landing appelle **`POST /api/v1/public/contact`** (l'ancien `/api/contact` n'existait pas) ;
   - le formulaire de préinscription de la landing appelle directement **`POST /api/v1/public/preinscriptions`** (même
     origine : `/api` est relayé vers l'API par Vite en dev et publié tel quel par le reverse proxy). L'ancien chemin
     `/api/preinscriptions` n'a jamais existé côté API : aucun relais n'est nécessaire, aucun lien envoyé ne le porte.
5. **Navigation et droits** : charger `GET /api/v1/bootstrap` au démarrage (permissions, modules actifs, organisme, couleur,
   entrées de navigation filtrées). Les messages 403 de module désactivé renvoient vers « Administration › Paramètres ›
   Modules » : garder cet intitulé ou adapter le message côté API.
6. **Refus motivés** : distinguer 403 (permission de la dépendance) et 409 (politique : code + `details`), et afficher
   `detail` / `details`. Les boutons s'appuient sur les objets `capabilities` renvoyés par les vues de détail.
7. **Modules désactivés par défaut** : `hr`, `funding` (et ses dispositifs), `relances`, `invoicing` sont désactivés tant qu'on ne les active
   pas (`PUT /api/v1/features/{code}`) ; leurs routes répondent 403 d'ici là. `signature`, `lms`, `agents` ne sont pas
   construits.
8. **Doublons de routes à arbitrer** : `GET /api/v1/formations` et `GET /api/v1/programs`, `GET /api/v1/formateurs` et
   `GET /api/v1/trainers`, `GET /api/v1/stagiaires` et `GET /api/v1/learners` (droits et formats différents) ;
   `POST /api/v1/formateurs/{id}/titres` et `POST /api/v1/trainer-qualifications`.
9. **Téléchargements** : documents, pièces, programmes et carnets sont servis en binaire ou en HTML ; les appels doivent
   porter l'en-tête `Authorization`, donc un simple `<a href>` ne suffit pas (passer par `fetch` + blob ou par un relais).
10. **Panneau Paramètres** : seuls l'organisme, les modules, les réglages datés, les comptes et les rôles sont modifiables par
    l'API. Règles de relance, modèles d'e-mails, questionnaires, dossiers de pièces, circuit de session, dispositifs de
    financement et pièces EDOF sont des fichiers YAML/HTML sans route d'écriture : le panneau ne peut que les afficher, sauf à
    ajouter des routes.
