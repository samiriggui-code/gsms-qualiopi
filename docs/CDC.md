# Cahier des charges — back-office GSMS Qualiopi

Version du 27/10/2026. Document de référence des chantiers du back-office. À lire avec `HANDOFF.md` (règles non
négociables, §2) et `docs/API.md` (routes et paramétrage).

## 1. Objet

GSMS Qualiopi gère **tout le quotidien d'un organisme de formation**, de la demande d'un candidat à la facture, et
transforme ces données en preuves Qualiopi. Un seul back-office (`app/`, coque WeKnora Vue 3 + TDesign aux couleurs
GSMS) réunit :

- la **gestion de l'organisme** (commercial, offre, sessions, apprenants, financement, facturation, ressources) ;
- la **qualité** (indicateurs, preuves, écarts, audits) ;
- l'**IA** WeKnora (bases de connaissances, assistant, agents), au service des deux premiers.

Le moteur ne prononce jamais la conformité : seul le certificateur en décide. L'interface n'écrit jamais « conforme ».

## 2. Architecture (rappel, non négociable)

| Couche | Dossier | Rôle |
|---|---|---|
| API métier | `backend/` (FastAPI, Python 3.12) | toutes les règles métier, une seule source ; servie sous `/api/v1` |
| Moteur IA | conteneurs `ia-*` (fork WeKnora Go) | documents, recherche, assistant ; servi sous `/ia` ; lit Qualiopi **par MCP**, jamais par la base |
| Back-office | `app/` | affiche les décisions de l'API (capacités, refus motivés) ; **aucune règle métier dans le front** |
| Site public | `landing/` | vitrine et préinscription |
| Marque | `theme/` | jetons de couleur et logos |

Deux bases séparées : `gsms` (Qualiopi, Alembic) et `weknora` (moteur IA). Aucun nouveau dépôt ni dossier frère : tout
se fait dans ce dépôt.

## 3. Conventions de code (squelette WeKnora)

### Backend (miroir de `internal/` de WeKnora)

| Couche | Emplacement | Contenu |
|---|---|---|
| Modèles | `app/types/<domaine>.py` | tables SQLAlchemy et constantes de valeurs |
| Accès | `app/application/access/<domaine>.py` | décisions (`Decision`, `PolicyDenied`), capacités par objet |
| Service | `app/application/service/<domaine>/` | logique métier, événements outbox |
| Handler | `app/handler/<domaine>.py` | routes HTTP minces : validation, appel du service, réponse |
| Droits | `app/router/rbac.py` | catalogue des permissions |
| Migrations | `migrations/versions/NNNN_*.py` | une migration par chantier, `alembic check` vert |
| Tests | `tests/test_<domaine>.py` | chaque route et chaque refus motivé |

### Front (miroir de `frontend/src/` de WeKnora)

| Couche | Emplacement | Contenu |
|---|---|---|
| Appels API | `src/api/gsms/<domaine>.ts` | un fichier par domaine, types TypeScript des réponses |
| Pages | `src/views/gsms/<domaine>/<Page>.vue` | une page par route, style des listes WeKnora |
| Composants partagés | `src/components/gsms/` | seulement s'ils servent dans au moins deux pages |
| Routes | `src/router/index.ts` | sous `/platform/…`, `meta.requiresAuth` |
| Menu | `src/components/menu.vue`, `src/stores/menu.ts` | rubriques filtrées par `GET /bootstrap` |
| Paramètres | `src/views/settings/gsms/` | sections du panneau Paramètres |
| Textes | `src/i18n/locales/fr-FR.ts` (+ `en-US.ts`) | clés sous `gsms.<domaine>.…` |
| Images | `src/assets/gsms/` | seulement les images effectivement importées par un écran |

### Patrons de page (trois niveaux, même expérience que WeKnora)

Repris des écrans WeKnora (`views/knowledge/KnowledgeBaseList.vue` : en-tête titre + icône + actions + sous-titre,
barre d'outils, squelettes de chargement, `EmptyState`) et des patrons de l'ancien front GSMS (commit `814e838` :
`components/page/section-landing`, `kpi-row`, `module-card`, `alert-list-card`, `engine-card`, `record-sheet`,
`components/gsms/action-gate`, `refusal`, `step-mark`). Chaque page est construite avec un de ces trois patrons :

| Niveau | Patron | Composition | Exemples |
|---|---|---|---|
| 1 | **Vue d'ensemble de rubrique** | en-tête, rangée de chiffres clés (KPI), points à traiter, état du moteur Qualiopi pour les indicateurs de la rubrique, une carte par module | Pilotage, École, Qualiopi, RH, Finances |
| 2 | **Liste** | en-tête + action principale, barre de filtres et recherche, tableau (≥ 768 px) ou cartes (téléphone), pagination, squelette, état vide, refus lisible | Sessions, Stagiaires, Preuves |
| 3 | **Fiche** | en-tête avec statut et actions gouvernées, onglets, panneaux de sections, historique | Fiche session, fiche stagiaire, fiche audit |

Composants partagés (`src/components/gsms/`), écrits une fois, en TDesign et aux jetons du thème, et utilisés par
toutes les pages :

| Composant | Rôle |
|---|---|
| `GsmsPageHeader` | titre, icône, sous-titre, actions (identique à l'en-tête des listes WeKnora) |
| `GsmsSectionLanding` | patron de niveau 1 (ne calcule rien : reçoit chiffres, alertes et modules) |
| `GsmsKpiRow` | rangée de chiffres clés, chaque chiffre lien vers la liste filtrée |
| `GsmsModuleCard` | carte d'un module de la rubrique (chiffres, lien) |
| `GsmsAlertList` | points à traiter (échéances, retards), avec leur source |
| `GsmsListPage` | patron de niveau 2 : filtres, tableau/cartes, pagination, états |
| `GsmsRecordSheet` | patron de niveau 3 : en-tête, onglets, sections |
| `GsmsActionGate` | bouton gouverné par une décision de l'API (`allowed`, `message`) : refusé, il reste visible et explique pourquoi |
| `GsmsRefusal` | affichage d'un 403 / 409 (`detail`, `details`) |
| `GsmsStatusTag` | statut coloré à partir du libellé renvoyé par l'API |
| `GsmsStepMark` | état d'une étape du parcours (fait, à faire, en retard, sans objet) |
| `GsmsPersonAvatar` | photo si elle existe, sinon initiales |

### Rubriques du menu (une section par thème)

| Section | Rubriques et pages (§5) |
|---|---|
| **Pilotage** (KPI) | tableau de bord, planning, bilans et rapports |
| **École** | commercial (demandes, devis, entreprises), offre de formation, sessions et pédagogie, apprenants, lieux et équipements |
| **Finances** | dossiers de financement, factures et avoirs, encaissements |
| **RH** | formateurs, personnel, développement des compétences, sous-traitants |
| **Qualiopi** | indicateurs, carnet d'audit, preuves, constats et actions, audits, réclamations, veille, partenaires, dossier de pièces |
| **Communication** | messages et relances, documents |
| **IA** | assistant, bases de connaissances, agents (écrans WeKnora) |
| **Administration** | journal, paramètres |

Chaque section ouvre sa vue d'ensemble (niveau 1) avant ses modules.

### Règles de propreté

1. **Pas de fichier orphelin** : tout fichier ajouté est importé, routé ou testé. Un fichier qui ne sert plus est supprimé
   dans le même chantier.
2. **Pas de fonction fantôme** : un bouton, un onglet ou un texte n'apparaît que si la route API existe et répond.
   Une page dont l'API manque n'est pas mise au menu ; elle est d'abord un chantier backend.
3. **Refus lisibles** : 403 (droit ou module désactivé) et 409 (politique, `detail` + `details`) s'affichent en clair,
   jamais comme une liste vide ou des compteurs à zéro.
4. **390 px et 1440 px** : chaque écran est vérifié aux deux largeurs (aucun débordement horizontal).
5. **Français partout** ; aucun nom de modèle d'IA dans le code, les commits ou les PR ; aucun secret dans git.
6. **Bonne pratique ≠ obligation** : « recommandé », « par défaut » ; jamais « obligatoire » sans texte réglementaire.

### Qualité, sécurité et sources externes

1. **Revue de code** : chaque chantier passe une revue CodeRabbit (`cr` en ligne de commande, sur les changements non
   commités) ; les remarques justes sont corrigées, les autres écartées avec leur motif dans le compte rendu.
2. **Revue de sécurité** : contrôle d'accès de chaque route (permission + portée de l'organisme), validation des entrées,
   routes publiques limitées et protégées contre l'abus, aucune donnée personnelle dans les journaux, pas de HTML non
   assaini dans le front (`v-html` interdit hors contenu nettoyé par DOMPurify), dépendances à version figée.
3. **Sources externes** : en cas de blocage, chercher dans la documentation officielle et les dépôts publics ; un dépôt
   étudié est cloné dans le dossier temporaire de la session, **jamais** dans ce dépôt ni à côté. Un code d'origine
   douteuse, sans licence compatible ou suspect (obfuscation, appels réseau inattendus) n'est pas repris ; on reprend
   une idée, pas un copier-coller.
4. **Sources réglementaires** : les textes Qualiopi viennent des référentiels importés (`backend/referentials/`) et des
   sources officielles listées dans `docs/edof/SOURCES.md` ; aucune règle n'est tirée d'un blog ou d'un forum.
5. **Données publiques Qualiopi** : il n'existe pas d'API « Qualiopi » de dépôt ou de certification. La seule source
   officielle interrogeable est la *Liste publique des organismes de formation* (art. L.6351-7-1 du Code du travail,
   DGEFP) : jeu `liste-publique-des-of-v2` sur `dgefp.opendatasoft.com` (API Explore v2.1) et sur data.gouv.fr. Elle donne
   le numéro de déclaration d'activité et les catégories certifiées ; elle peut servir à **aider** la vérification d'un
   sous-traitant (chantier C15), jamais à affirmer seule qu'un organisme est certifié (la liste a un délai de mise à jour).

### Images reprises de GSMS School

Les visuels de l'ancienne application (`gsms-school-aps/apps/lms-crm/public/`) sont déjà dans `landing/public/`
(formations SSIAP, SST, TFP APS…, logos CNAPS, Qualiopi, OPCO, France Travail, drapeaux, avatars). Le back-office en
copie **uniquement ce qu'un écran utilise** dans `app/src/assets/gsms/` :

- `formations/` : vignette d'une formation du catalogue (associée par le code du programme) ;
- `certifications/` : logos des organismes et labels (CNAPS, Qualiopi, OPCO, France Travail) ;
- `drapeaux/` : sélecteur de langue et nationalité d'un apprenant ;
- `avatars/` : **données de démonstration seulement** (photos attribuées aux personnes fictives de `seed-demo`) ;
  une personne réelle sans photo affiche ses initiales, jamais une photo d'exemple.

## 4. Données d'exemple

`python -m app.cmd.cli seed-demo` remplit la base avec un organisme fictif (sessions SSIAP et SST passées, en cours et à
venir, stagiaires, formateurs, preuves, écarts). Chaque chantier **complète la démo** pour que ses écrans montrent
des cas réels : liste remplie, état vide, refus motivé. `retirer-demo` retire tout avant la mise en service.

Compte de développement : `admin@gsms.local` (mot de passe prérempli par `scripts/dev.sh`, jamais en production).

## 5. Inventaire des pages (42 pages, 12 rubriques)

État : **API** = routes existantes, il ne reste que l'écran ; **API partielle** = écran possible, complément backend
prévu ; **à créer** = chantier backend d'abord.

### A. Pilotage
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 1 | Tableau de bord (feuille de route, alertes) | `/platform/pilotage` | `GET /pilotage/feuille-de-route`, `/qualiopi/echeances` | API |
| 2 | Planning (sessions, formateurs, salles) | `/platform/planning` | `GET /sessions` (dates, lieu, formateur) | API partielle (vue calendrier côté API) |
| 3 | Bilans et rapports | `/platform/rapports` | carnet Qualiopi, synthèses | API partielle (bilan pédagogique et financier à créer) |

### B. Commercial
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 4 | Demandes et préinscriptions | `/platform/demandes` | — (la landing poste déjà vers `/api/preinscriptions`, absente) | **à créer** |
| 5 | Devis (liste) | `/platform/devis` | `GET /editions?type=DEVIS` | API |
| 6 | Fiche devis | `/platform/devis/:id` | `GET /editions/{id}`, aperçu | API |
| 7 | Entreprises clientes | `/platform/entreprises` (+ fiche) | CRUD `/companies` | API |

### C. Offre de formation
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 8 | Catalogue des formations | `/platform/formations` | `GET /formations`, `/programs` | API |
| 9 | Fiche formation (versions, programme, certification) | `/platform/formations/:id` | `GET /fiches/{id}`, versions | API |
| 10 | Référencement CPF (EDOF) | `/platform/edof` (+ par formation) | `/edof/*` | API |

### D. Sessions et pédagogie
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 11 | Sessions (liste filtrable) | `/platform/sessions` | `GET /sessions` | API |
| 12 | Fiche session (inscriptions, cycle de vie, documents, Qualiopi) | `/platform/sessions/:id` | `GET /sessions/{id}`, capacités | API |
| 13 | Émargement (demi-journées, QR de salle) | `/platform/emargement` | `/emargement/*` | API |
| 14 | Évaluations des acquis et résultats d'examen | `/platform/evaluations` | étapes du parcours (`POST /inscriptions/{id}/parcours/{action}`), registres `GET /parcours/registres/{vue}` | API partielle (liste transverse des évaluations et résultats d'examen à créer) |
| 15 | Satisfaction (à chaud, à froid, entreprise) | `/platform/satisfaction` | `/surveys`, questionnaires | API |

### E. Apprenants
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 16 | Stagiaires (liste) | `/platform/stagiaires` | `GET /stagiaires` | API |
| 17 | Fiche stagiaire (parcours, documents, financement) | `/platform/stagiaires/:id` | `/parcours/*`, documents | API |
| 17 bis | Registres du parcours (besoins, positionnements, convocations, attestations, abandons…) | `/platform/parcours/:vue` | `GET /parcours/synthese`, `/parcours/registres/{vue}` | API |

### F. Financement et facturation
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 18 | Dossiers de financement (CPF, OPCO, France Travail…) | `/platform/financement` | `/financement/*` (module `funding`) | API |
| 19 | Factures et avoirs | `/platform/factures` (+ fiche) | — | **à créer** |
| 20 | Encaissements et relances de paiement | `/platform/paiements` | — | **à créer** |

### G. Ressources
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 21 | Formateurs (liste) | `/platform/formateurs` | `GET /formateurs` | API |
| 22 | Fiche formateur (qualifications, pièces, compte) | `/platform/formateurs/:id` | `/formateurs/{id}`, dossiers | API |
| 23 | Personnel, contrats, absences | `/platform/personnel` | `/rh/*` (module `hr`) | API |
| 24 | Développement des compétences | `/platform/developpement` | `/staff-development` | API |
| 25 | Lieux et salles | `/platform/lieux` | CRUD `/premises` | API |
| 26 | Équipements et vérifications | `/platform/equipements` | CRUD `/equipment` (`next_check_on`) | API |
| 27 | Sous-traitants | `/platform/sous-traitants` | CRUD `/subcontractors` | API |
| 28 | Partenaires (handicap, socio-économiques) | `/platform/partenaires` | CRUD `/partners` | API |

### H. Qualité Qualiopi
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 29 | Indicateurs (état par indicateur) | `/platform/qualite/indicateurs` | `/qualiopi/evaluations` | API |
| 30 | Fiche indicateur (textes, contrôles, preuves) | `/platform/qualite/indicateurs/:n` | `/qualiopi/indicateurs/{n}` | API |
| 31 | Preuves (liste, fiche, validation) | `/platform/qualite/preuves` | `/qualiopi/preuves`, `POST /evidence/{id}/validation` | API |
| 32 | Constats et actions correctives | `/platform/qualite/constats` | `/qualiopi/constats`, actions | API |
| 33 | Audits internes (+ fiche) | `/platform/qualite/audits` | `/qualiopi/audits/*` | API |
| 34 | Réclamations | `/platform/qualite/reclamations` | CRUD `/complaints` | API |
| 35 | Veille | `/platform/qualite/veille` | CRUD `/watch-items` | API |
| 36 | Dossier de pièces de l'organisme | `/platform/qualite/dossier` | `/dossiers/ORGANISME/…` | API |
| 36 bis | Carnet d'audit (lecture et impression) | `/platform/qualite/carnet` | `/qualiopi/carnet`, `/qualiopi/carnet/impression` | API |

### I. Communication
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 37 | Messages et relances (à valider, envoyés) | `/platform/messages` | `/communications/*` (module `relances`) | API |

### J. Documents
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 38 | Documents (pièces déposées, documents rédigés) | `/platform/documents` | `/documents/*` | API |

### K. Administration
| # | Page | Route front | API | État |
|---|---|---|---|---|
| 39 | Journal des modifications | `/platform/journal` | `/journal` | API |
| 40 | Paramètres (panneau WeKnora, sections Qualiopi) | `/platform/settings` | voir `docs/API.md` §3 | API |

### L. IA (écrans WeKnora existants)
Bases de connaissances (dont « Référentiel Qualiopi »), assistant, agents : écrans WeKnora repris tels quels ; l'assistant
consulte Qualiopi par le serveur MCP de l'API.

## 6. Chantiers

Chaque chantier se termine par : revue CodeRabbit et revue de sécurité (§3), tests backend (`./scripts/test-backend.sh`, `alembic check`), `vue-tsc`, `vite build`,
`npm test` dans `app/`, vérification réelle sur le serveur de dev avec les données d'exemple (390 et 1440 px), une
ligne dans `HANDOFF.md`, et un commit sur la branche de travail.

| # | Chantier | Contenu | Dépend de |
|---|---|---|---|
| C0 | Marque et socle | logo, palette, connexion unique, déconnexion, préremplissage dev | — (fait) |
| C1 | Patrons, menu et pages Qualité | composants partagés `src/components/gsms/` (§3), sections du menu filtrées par `/bootstrap`, vues d'ensemble Pilotage et Qualiopi ; pages 1, 29 à 36 bis, 39 | C0 |
| C2 | Panneau Paramètres | sections Qualiopi (page 40) | C0 |
| C3 | IA : MCP et « Référentiel Qualiopi » | outils en lecture, enregistrement auto, base de connaissances | C0 |
| C4 | Sessions et pédagogie | pages 11 à 15 | C1 |
| C5 | Offre et apprenants | vue d'ensemble École ; pages 8 à 10, 16 à 17 bis | C1 |
| C6 | Ressources | vue d'ensemble RH ; pages 21 à 28 | C1 |
| C7 | Commercial existant | pages 5 à 7 | C1 |
| C8 | Financement | page 18 | C1 |
| C9 | Préinscriptions (backend + front) | route publique `POST /api/v1/public/preinscriptions` (et chemin `/api/preinscriptions` de la landing), modèle, page 4 | C1 |
| C10 | Facturation (backend + front) | factures, avoirs, numérotation continue, encaissements ; pages 19 et 20 | C7, C8 |
| C11 | Planning et rapports | vue calendrier, bilans ; pages 2 et 3 | C4 |
| C12 | Communication et documents | pages 37 et 38 | C1 |
| C13 | Images et démo | `src/assets/gsms/` (formations, certifications, drapeaux, avatars de démo), compléments de `seed-demo` | C4, C5, C6 |
| C15 | Vérification des sous-traitants (facultatif) | aide à la vérification du NDA et des catégories certifiées par la liste publique DGEFP, résultat daté et sourcé, jamais bloquant | C6 |
| C16 | Sécurité : corrections de l'audit du 27/10/2026 | constats CodeRabbit du backend (envoi en double, portée des preuves formateur, pièce retirée, CSS des pages A4…) ; session IA réservée à `ia.use`, MCP limité au réseau interne, pas de jeton de rafraîchissement IA dans le navigateur ; limitation de débit, starlette corrigée, liens de documents expirants, `openapi.json` fermé en production | C3 |
| C17 | Sécurité : front et publication | dépendances front vulnérables (dompurify, axios, mermaid) mises à jour et figées ; publication du back-office en production (aujourd'hui `app/nginx.conf` est celui de WeKnora et envoie `/api/` au moteur IA) avec CSP stricte ; version de jeton par utilisateur (révocation au changement de mot de passe, migration) | C1, C2 |
| C20 | Landing pilotée par le back-office (temps réel) | fiche formation : « publiée sur le site » et modes de financement proposés (CPF, OPCO, France Travail, entreprise, personnel) ; personnel et formateurs : « visible sur le site », photo, fonction ; routes publiques en lecture seule (catalogue publié, fiche publique, sessions à venir et en cours avec dates, état des inscriptions — ouvertes, fermées, démarrée — et places restantes calculées par l'API, équipe visible) ; la landing lit ces routes à chaque visite au lieu de content/fiches.json ; aucune donnée interne exposée | C13, photos en base |
| C14 | Recette | parcours complet dans le navigateur, captures 390 / 1440 px, axe-core, mise à jour HANDOFF | tous |

Les chantiers d'une même vague touchent des dossiers distincts (`views/gsms/<domaine>/`, `api/gsms/<domaine>.ts`) ; le
menu, le routeur et les fichiers de traduction sont des points de passage communs : modifications ciblées, relire le
fichier juste avant d'écrire.
