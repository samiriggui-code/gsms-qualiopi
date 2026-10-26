# Handoff — GSMS Qualiopi (reprise en local)

Dernière mise à jour : 05/10/2026 (parcours EDOF fusionné dans `main` ; données réelles de Form'SSI complétées, §5 ter).
À lire en entier avant de toucher au code.

> **26/10/2026 — Front retiré.** le front Next.js/Metronic a été **retiré volontairement** (26/10/2026) : il sera refait en Vue 3 + TDesign, avec la coquille du back-office Global-IT-SS (kit dérivé de WeKnora : menu, panneau Paramètres). Le dépôt ne contient plus que le moteur Qualiopi et ses API ; l'inventaire des routes et des entités de paramétrage est dans [`docs/API.md`](docs/API.md). L'ancien front reste consultable dans l'historique git (commit `814e838`). Les mentions du front dans les §5 et suivants décrivent l'historique ; elles ne correspondent plus au contenu du dépôt.

## 1. Le produit

- **GSMS** = « Global Security Management System » : suite d'applications éditée par **Global-IT-SS**,
  la société du propriétaire du dépôt. GSMS Qualiopi en fait partie.
- **Form'SSI** est l'école de formation (sécurité incendie, SSIAP, SST…) qui a commandé l'application.
  C'est le terrain de test : la démo porte son nom.
- L'application gère le quotidien d'un organisme de formation. Un moteur transforme ces données en
  preuves Qualiopi et explique chaque écart. Il ne prononce **jamais** la conformité : seul le
  certificateur en décide.

## 2. Règles à respecter (non négociables)

1. **Ne jamais présenter une bonne pratique comme une obligation réglementaire.** Qualiopi impose des
   preuves, pas des relances ni des délais. Le texte doit dire « recommandé », « par défaut », etc.
2. **Ne jamais montrer une fonction qui n'existe pas** (écran, bouton, texte marketing).
3. **Aucun secret dans git** : `.env`, clés, jetons, mots de passe réels.
4. **Metronic est sous licence, et ce dépôt est PUBLIC.** Aucun fichier Metronic (sources, SCSS,
   composants, images de la démo) ne doit être commité ici tant que le dépôt est public. Voir §6.
5. Le lien d'achat ThemeForest est personnel : il ne doit pas être envoyé à un service tiers.
6. Aucun nom ou identifiant de modèle d'IA dans les commits, le code ou les PR.
7. Le front **ne recode aucune règle métier** : il affiche ce que l'API décide (capacités, refus
   motivés, états des étapes). Voir `ActionGate`.
8. Tout est en français : interface, messages, commits.
9. Le propriétaire travaille souvent depuis un smartphone. Tout écran doit donc être impeccable à 390 px.

## 3. Pile et architecture

- **Backend** : FastAPI, SQLAlchemy 2, Alembic (migrations `0001` → `0017`), PostgreSQL 16,
  Pydantic 2, Jinja2.
  - Schémas : `iam`, `config`, `formation`, `qualite`, `rh`, `financement`, `communication`, `edof`.
  - Un worker (`app/cmd/worker.py`) lit l'outbox des événements, réévalue le moteur, planifie et envoie les
    relances.
- **Front** : retiré (voir l'encadré en tête). L'ancien front Next.js passait par un BFF (cookie httpOnly
  `gsms_session`, relais `/api/backend/…` et `/api/public/…`) ; le nouveau devra fournir l'équivalent ou
  appeler l'API directement (CORS_ORIGINS). Routes : `docs/API.md`.
- **Motifs du moteur, à réutiliser partout** :
  - `Decision` / `PolicyDenied` (409 `{error, detail, details}`), capacités par objet ;
  - réglages datés (`ConfigurationService`, registre dans `app/application/service/platform/settings.py`) ;
  - fonctionnalités activables (`app/application/service/platform/features.py`) ;
  - catalogue de permissions (`app/router/rbac.py`) ;
  - événements outbox (`publish`), journal des modifications, références `next_reference(db, prefix)`.

Détail des modules : `README.md`. Routes et paramétrage : `docs/API.md`.

## 4. Démarrer et vérifier

```bash
# Backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gsms
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
alembic upgrade head && python -m app.cmd.cli seed-demo
# seed-demo marche aussi sur une base déjà importée (Form'SSI, GSMS School) : les exemples (sessions,
# apprenants, formateurs, réclamations… créés par « démo ») rejoignent l'organisme existant sans le modifier.
# python -m app.cmd.cli retirer-demo les retire tous avant la mise en service réelle.
uvicorn app.cmd.server:app --reload          # :8000, doc sur /docs
python -m app.cmd.worker                   # second terminal
```

E-mails en local : Mailpit (`docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`,
SMTP sur le port 1025 déjà par défaut, interface http://localhost:8025). Sur le
VPS : un vrai SMTP (`SMTP_*` dans `.env`).

**Vérifications avant chaque commit** (toutes vertes au dernier commit) :

```bash
cd backend && ruff check . && python -m pytest && alembic check        # 182 tests au 02/10
```

Comptes de démonstration (mot de passe `demo-gsms-2026`) :

- `direction@demo.fr`
- `gestion@demo.fr`
- `julie@demo.fr` (formatrice)

## 5. Ce qui est fait

**Backend**

- Socle : rôles, permissions, fonctionnalités, réglages datés.
- Formation, émargement électronique, RH, financement.
- Parcours du stagiaire (états datés par étape) ; convocation et attestation rédigées par le moteur
  (modèles Jinja figés, empreinte SHA-256).
- Chaîne Qualiopi (critère → indicateur → preuves → contrôles → écarts → actions correctives →
  historique).
- **Relances** (`app/relances/`, calendrier `config/relances/standard.yaml`, modèles
  `config/emails/*.html`) :
  - convention à signer J-15, J-10, J-7 ; rappel J-2 ; récapitulatif formateur J-7 ; évaluations
    J+1, J+4 ; alertes d'échéancier ; synthèse qualité le lundi ;
  - questionnaires en ligne : besoin et positionnement J-15, J-10, J-7 ; à chaud fin, J+2, J+5 ; à
    froid J+45, J+52 ; entreprise J+60, J+67 ;
  - transmission de la convocation (J-10, J-5) et de l'attestation (J+3, J+7, J+14) par lien signé.
  - Mécanique :
    - les messages externes sont « à valider » avant envoi ; les alertes internes partent directement ;
    - la condition est relue avant l'envoi, sinon le message est annulé avec son motif ;
    - la planification est idempotente ;
    - l'envoi est tracé (modèle et version, empreinte, tentatives).
  - Module `relances` **désactivé par défaut**.
- **Questionnaires** (`app/questionnaires/`, définitions `config/questionnaires/*.yaml`) :
  - lien HMAC personnel, sans compte ;
  - la réponse devient l'analyse du besoin, le positionnement ou l'appréciation, sans jamais écraser
    une saisie ;
  - publie les événements habituels ;
  - une seule réponse par lien ; le lien a une date d'expiration.

**Front** (écrans maison, sobres, testés)

- Connexion : écran partagé avec la photo des pages d'accès de GSMS-School-Aps.
- Liste des sessions.
- Détail de session : onglets Parcours, Émargement, Qualiopi.
- Panneau du stagiaire.
- Page publique `/q/[token]`.
- Tests Playwright sur ordinateur (1440 px) et mobile (390 px), avec axe-core et contrôle de
  débordement.

**Écarté** : le front « Astra » livré par un autre outil a été refusé par le propriétaire. Ne pas le
réintroduire.

## 5 bis. Fusion du 29/09 au soir (session locale)

- Le front Metronic a été intégré sur `main` : concept **CRM** de Metronic 9.5 (et non demo4/demo6),
  aux couleurs Form'SSI, dans `frontend/` (structure `app/`, `components/`, `lib/` à la racine, pas `src/`).
  L'ancien front maison de cette branche reste consultable dans l'historique (commit `fbb1e8b`).
- **Décision du propriétaire (29/09)** : le dépôt reste public avec le code Metronic, en connaissance de
  cause (licence ThemeForest). La règle 4 du §2 est donc levée par lui ; ne pas redemander.
- Backend : celui de cette branche, intégralement. Les ajouts backend faits en parallèle sur `main`
  (CRUD générique, migration `created_by` en double) ont été abandonnés.
- **Le front doit être rebranché sur cette API** : aujourd'hui seuls la connexion, `/auth/me`, la liste
  des sessions et `/referentials/active` répondent. Les pages Indicateurs et les 11 pages CRUD
  (entreprises, apprenants, formateurs, qualifications, développement, sous-traitants, partenaires,
  veille, réclamations, satisfaction, programmes) appellent des routes absentes (404) : à rebrancher sur
  `/formations`, `/formateurs`, `/stagiaires`, `/rh/*`, `/qualiopi/*`, ou à ajouter côté API.
  **Fait le 30/09** : l'API CRUD de `main` est réintégrée (`app/handler/crud.py`, `app/handler/training_resources.py`,
  droits actuels : `sessions.write`, `trainers.write`, `quality.write`) ainsi que
  `/referentials/active/indicators[/{n}]`. Les 43 pages du menu n'ont plus aucun appel en erreur.
- Pages et composants Metronic à récupérer : `C:/laragon/www/gsms-school/apps/lms-crm` (171 pages, dont
  23 pages Qualiopi).
- Local : base `gsms_qualiopi` recréée avec ces migrations (l'ancienne est gardée en
  `gsms_qualiopi_old`) ; administrateur `admin@gsms.local` / `admin-gsms-2026` (préremplis en dev).

## 5 ter. Parcours « Référencement CPF (EDOF) » (02/10/2026)

Documentation : `docs/edof/PARCOURS.md` (parcours, contrôles, informations à obtenir de Form'SSI),
`docs/edof/INVENTAIRE.md` (ce qui existe dans gsms-qualiopi et gsms-school-aps), `docs/edof/SOURCES.md`
(sources officielles relues le 02/10/2026 et leurs divergences).

- **Backend** `app/edof/` + migration `0017` :
  - fiche formation unique (`formation.program` complété, `program_certification`, `program_trainer`,
    `program_resource`) et **versions validées figées** (`program_version`, empreinte) ; programme
    rédigé (`config/documents_generes/programme.html`) et aperçu public lus dans une version ;
  - schéma `edof` : profil de l'établissement, dossiers établissement et formation, pièces rattachées
    à des `formation.document` (une pièce commune n'est jamais copiée), compléments de la CDC,
    accompagnement de la CDC ;
  - référentiel des pièces `config/edof/referencement.yaml` (conditions, ancienneté, SIRET, pièces
    sensibles) ; contrôles `app/application/service/edof/checks.py` avec niveau et cible ;
  - cycle **déclaratif** : aucune API de dépôt EDOF n'existe, GSMS ne transmet rien ;
  - permissions `edof.read|write|validate|sensitive`, `programs.validate` ; fonctionnalité `edof`
    (active par défaut) ; les événements `edof.*` ne relancent pas le moteur Qualiopi ;
  - `python -m app.cmd.cli import-formssi` : identité de Form'SSI et formation TFP APS, sans rien écraser.
- **Front** : `/formation/edof` (établissement) et `/formation/edof/[programId]` (onglets Contrôles,
  Programme, Contenus, Certification, Documents et aperçu, Transmission, Suivi pédagogique) ;
  composants `components/edof/`, requêtes `lib/gsms/edof.ts`.
- **Vérifications faites** : 182 tests backend, `ruff`, `alembic check` ; `tsc`, `eslint` (avec le
  contournement ci-dessous), `next build` ; parcours relu dans l'application réelle par un script
  Playwright hors dépôt : ordinateur 1440 px et téléphone 390 px, aucun débordement, axe-core sans
  violation propre aux écrans EDOF (restent les contrastes du bleu du thème, communs à tout le front),
  dépôt et validation d'un Kbis de bout en bout à travers le proxy.
- **Attention, outillage du front sur `main`** : les scripts `typecheck`, `format:check` et `test:e2e`
  cités plus bas n'existent plus dans `package.json`, ni le dossier `e2e/` ; `npm run lint` plante
  (surcharges `ajv >=8.18` et `minimatch ^10` incompatibles avec `@eslint/eslintrc`). Contournement local
  utilisé : copier `ajv@6` dans `node_modules/@eslint/eslintrc/node_modules` et
  `node_modules/eslint/node_modules`, et `minimatch@3` dans le premier. À corriger dans `package.json`.

## 5 quater. Pages Preuves, Évaluations et Audits (05/10/2026)

La rubrique Qualiopi du menu n'a plus de page « À construire ».

- **API** `app/handler/qualiopi_ecrans.py` (lectures prêtes à afficher, décisions motivées) :
  `GET /qualiopi/preuves[/{id}]`, `GET /qualiopi/evaluations`, `/qualiopi/evaluations/resultats`,
  `/qualiopi/constats`, et les audits internes `GET|POST /qualiopi/audits`, `/audits/echantillon`,
  `/audits/comparaison`, `GET /audits/{id}`, `POST /audits/{id}/indicateurs/{n}`, `POST /audits/{id}/cloture`.
  La validation d'une preuve reste `POST /evidence/{id}/validation`. Tests : `tests/test_ecrans_qualiopi.py`.
- **Front** : `/qualiopi/preuves` (liste filtrable, fiche, valider ou rejeter avec la grille de relecture),
  `/qualiopi/evaluations` (état par indicateur, résultats des contrôles, constats, historique, « Tout
  réévaluer »), `/qualiopi/audits` et `/qualiopi/audits/[id]` (ouverture avec échantillon proposé, jugement
  indicateur par indicateur sur la photo figée, clôture qui crée les constats, évolution entre audits).
- Le jugement d'audit stocké `CONFORME` s'affiche « Satisfait » : l'application n'écrit jamais « conforme ».
- Le composant de démonstration `MockAuditChat` (« Eve ») n'est branché nulle part : aucune auditrice simulée
  n'existe côté API.

## 5 quinquies. Offre de formation reprise de GSMS School (05/10/2026)

La rubrique « Offre de formation » n'a plus de page « À construire ».

- **Import** `python -m app.cmd.cli import-gsms-school` (`app/application/service/training/import_school.py`) lit
  `config/catalogue/gsms-school.yaml`, produit par lecture du dépôt gsms-school-aps (fiches vitrine, catalogue,
  sites et salles, inventaire). Il crée 29 formations (TFP APS reste à `import-formssi` ; « Commission de
  sécurité » et « Formation intra-entreprise » écartées : conseil et sur-mesure), 10 lieux et 43 équipements.
  Il ne modifie jamais l'existant. Chaque écart ou manque est dans `review_notes` (prix « à partir de » à
  confirmer, durées en fourchette, textes sans accents rétablis, programmes de recyclage SSIAP à rédiger, RNCP/RS à
  vérifier). **Jamais repris** : les taux écrits en dur (87 à 100 %), les notes et avis, le texte « SI.Groupe »
  d'un autre organisme, les fournisseurs et factures fictifs de l'inventaire, les sessions de démonstration.
  Lieux et équipements arrivent « à vérifier sur place ».
- **Tables** (migration 0018) : `formation.premises` (site, salle, plateau technique, stockage) et
  `formation.equipment` (article, quantité, lieu, vérifications) ; `program.results_basis` garde la période et
  les effectifs d'un taux publié. `satisfaction_rate` est une part de répondants satisfaits, en %.
- **API** `app/handler/training_offre.py` : `GET /formation/resultats?mois=` (réussite à l'examen, abandons,
  satisfaction à chaud mesurés par formation, écarts avec les taux publiés), `POST
  /formation/resultats/{id}/publication` (refus motivé `NOTHING_MEASURED`), `GET /formation/ressources`.
  CRUD `premises` et `equipment` (`app/handler/training_resources.py`). Tests : `tests/test_offre_formation.py`.
- **Front** : `/formation/resultats`, `/formation/ressources` (même formulaire que l'onglet Contenus de la fiche,
  `components/edof/resource-fields.ts`), `/formation/locaux`, `/formation/moyens`.
- Pas encore fait : affecter un lieu et du matériel à une session (la session garde ses champs texte), débouchés
  et taux d'insertion (aucune donnée).
- **Catalogue des formations** (`/formation/programmes`, refait le 05/10/2026 sur le modèle des pages formations
  de GSMS School, à la demande de samir qui trouvait le tableau « vide de sens ») : indicateurs, filtres par
  filière et parcours, grille avec les visuels des fiches vitrine (`frontend/public/formations`) ou liste, fiche
  détaillée en panneau (`components/catalogue/formation-sheet.tsx`) avec les onglets Vue d'ensemble, Programme,
  Prérequis, Évaluation, Sessions et À arbitrer. API : `GET /formation/catalogue` et `/formation/catalogue/{id}`
  (sessions et résultats mesurés), la fiche vient de `GET /fiches/{id}`. Migration 0019 : `program.track`,
  `pathway`, `evaluation_steps`. Relancer `import-gsms-school` (et `import-formssi` pour TFP-APS) complète les
  formations déjà importées sur ces rubriques vides, sans rien remplacer.

## 5 sexies. Mise en page GSMS School sur toutes les pages (05/10/2026, étape 1)

Cartographie page par page : `/mnt/project-files/cartographie/gsms-school-vers-qualiopi.md` (dossier partagé du
projet). Ordre : briques communes, Sessions + Agenda, Apprenants, RH/Locaux/Moyens, Entreprises/financeurs,
Qualité/Documents, Tableau de bord.

Étape 1 (briques communes) :
- `components/page/page-hero.tsx` (bandeau de titre) et `components/page/kpi-row.tsx` (bandeau de cartes KPI) ;
- `ResourceConfig` accepte `eyebrow`, `description`, `kpis(rows)`, `card(row)` et `defaultView` ; `ResourcePage`
  affiche alors le bandeau, les KPI et une bascule grille/liste (`components/resource/record-card.tsx`) ;
- les 12 pages génériques (apprenants, entreprises, locaux, moyens, formateurs, qualifications, développement,
  sous-traitants, partenaires, veille, réclamations, satisfaction) en profitent ; les KPI sont comptés sur la liste
  chargée, rien d'inventé ;
- Programmes utilise les mêmes briques ; 5 cartes par ligne à partir de 1536 px. Attention : en Tailwind 4 un
  point d'arrêt arbitraire (`min-[1600px]:`) sort avant `xl:` dans la CSS et perd ; utiliser `2xl:`.

Étape 2 (Sessions et Agenda) :
- la liste des sessions (`GET /sessions`) porte `program_track`, `program_track_label` et `program_slug` (visuel) ;
- `/formation/sessions` : bandeau de titre, 5 KPI (à venir, en cours, inscrits, sans formateur, sans salle), filtre
  par filière, vue grille (`session-card.tsx`) ou tableau ; la fiche reste `/formation/sessions/[id]` ;
- `/agenda` (nouvelle page) : planning semaine (une ligne par session, lun.–sam.) ou mois, KPI de la période,
  jour par jour sur téléphone ; lecture seule, rien n'y est créé.

## 5 septies. Modèles de page : page témoin (13/10/2026)

Demande du propriétaire : une page témoin des modèles (sections, cartes, tableaux, graphiques) que toutes les pages
suivent, chaque page n'ajoutant que ses détails. Elle est sous **Administration › Modèles de page**
(`app/(app)/administration/modeles`), montée sur les vraies données (sessions, échéancier, organisme).

- Trois modèles : **accueil de module** (bandeau de titre ; 4 chiffres en pavé 2 × 2 + encart d'accueil ; donut
  de répartition + courbe d'évolution ; alertes + tableau, en lignes 1/3 – 2/3), **liste** (bandeau, 5 cartes
  chiffres, carte de filtres, grille ou tableau), **fiche** (grand panneau : bandeau, colonne de gauche, onglets,
  pied d'actions). Un onglet « Pages » dit quelle page suit quel modèle et où elle en est.
- Briques communes dans `components/page/` : `PageHero`, `KpiRow` (option `tiles`), `SectionCard`,
  `LandingRow`, `SectionEmpty`, `WelcomeCallout`, `DonutCard`, `EvolutionCard`, `AlertListCard`,
  `RecordSheet` (+ `SideCard`, `SideLine`). Toute nouvelle page les utilise au lieu de recréer sa mise en forme.
- Les graphiques ne calculent rien de métier : ils dessinent des comptes de la liste chargée ou de l'API, et
  disent « pas de données » quand il n'y en a pas.

## 5 octies. Documents professionnels : devis (13/10/2026, étapes 0 et 1)

Module local, sans service externe ni lien avec GSMS-Security ou un moteur de propositions central.

- **Étape 0** : chaque entreprise cliente porte un **code** (2 à 12 lettres ou chiffres, unique), une adresse et
  un téléphone. Réglages datés du domaine `documents` (Paramètres › Documents) : coordonnées de l'organisme,
  régime de TVA (`NON_RENSEIGNE` par défaut, réglage réglementaire : rien n'est supposé), validité des devis,
  conditions de paiement, mentions.
- **Étape 1** : schéma `edition` (`projet`, `ligne`, `etape`, migration 0020), code dans `backend/app/editions/`.
  Seul le type **DEVIS** est construit ; les autres types sont déclarés mais refusés (`NOT_BUILT`).
  Numéro par client : `DEV-<CODE>-001`, suite propre à chaque client (`next_reference`).
- Circuit : brouillon → relecture → validé → envoyé → archivé (ou abandonné). Les vérifications (SIRET,
  adresses, régime de TVA, prix manquant ou « à confirmer ») bloquent la soumission et la validation.
  Chaque validation archive une version HTML figée dans `formation.document` (empreinte SHA-256, la précédente
  passe « remplacée »). Les événements `edition.*` n'entrent pas dans le moteur Qualiopi.
- Rendu A4 : `config/documents_pro/` (imprimé ou enregistré en PDF par le navigateur). Les helpers communs avec
  le carnet d'audit sont dans `app/common/rendu_a4.py` ; le carnet n'a pas changé (sortie identique octet pour octet).
- Front : section **Documents** (accueil, liste, fiche) sur les modèles de page ; droits `documents.read`,
  `documents.write`, `documents.validate`.

## 5 nonies. Accueil global (13/10/2026)

Demande du propriétaire : un niveau « Accueil » au-dessus des sections, comme dans l'ancien front GSMS School
(gsms-school-aps, archivé dans `/mnt/project-files/archives/gsms-school-aps.bundle`, captures dans
`/mnt/project-files/captures/ancien-front/`). Chaîne visée : Accueil global → section → accueil de module → liste
→ fiche.

- `/accueil` (`frontend/app/(app)/accueil/page.tsx`) : compteurs (sessions à venir, indicateurs démontrables,
  écarts ouverts, actions en retard), « À surveiller » (actions correctives et échéances en retard, habilitations
  à renouveler), prochaine session, puis une carte par section du menu.
- Chaque carte liste les modules de la section et les indicateurs qu'elle alimente (`spec.indicators` du menu),
  avec l'état que le carnet d'audit donne à chacun. Aucun état n'est calculé côté front.
- « Accueil » est la première entrée du menu ; c'est la page d'arrivée après connexion et le lien du logo.
  Le tableau de bord reste à `/`.
- `NavSection.description` : phrase de chaque section, reprise sur sa carte.
- Reste : les pages d'atterrissage de section ; les cartes ouvriront alors la section au lieu du premier module.

## 5 decies. Page de section Offre de formation (13/10/2026)

Niveau 1 de la navigation (accueil global → section → accueil de module → liste → fiche) : `/formation`.
- `NavSection.path` déclare la page d'une section ; la sidebar ajoute alors « Vue d’ensemble » en tête de la
  section (active seulement sur cette page) et la carte de l'accueil global ouvre la section.
- Contenu : bandeau, 5 KPI du catalogue, sessions par statut et par mois, « À traiter » (fiches non validées,
  points à arbitrer, lieux à vérifier, matériel en retard de vérification), carte « Moteur Qualiopi » (une
  ligne par indicateur de la section, état du carnet, lien vers `/qualiopi/carnet?i=N`), une carte par module.
- Briques réutilisables : `components/page/engine-states.tsx` (états du moteur pour une liste d'indicateurs)
  et `components/page/module-card.tsx` (carte de module).
- Les indicateurs d'une section viennent de `spec.indicators` du menu : Résultats (2, 3), Ressources (19),
  Locaux et Moyens (17) y ont été ajoutés.
- Suite : accueil du module Programmes (la page actuelle devient la liste), fiche formation reliée au moteur,
  puis les pages des autres sections.

## 5 undecies. Accueil du module Programmes (13/10/2026)

- `/formation/programmes` est l'accueil du module (modèle « accueil de module ») ; le catalogue est à
  `/formation/programmes/liste`, qui ouvre la fiche d'une formation par l'adresse (`?id=`) et le formulaire de
  création par `?nouveau=1`.
- Contenu : 4 tuiles du catalogue, encart d'accueil, formations par filière, sessions des six prochains mois,
  « À arbitrer » (points, rubriques manquantes, fiche à valider), carte « Moteur Qualiopi » des indicateurs du
  module (1, 5, 6, 7), prochaines formations.
- `components/page/engine-card.tsx` : la carte « Moteur Qualiopi », partagée avec la page de section.
- Suite : relier la fiche formation au moteur (onglet Qualiopi : contrôles, preuves, pièces).

## 5 duodecies. Fiche formation reliée au moteur (13/10/2026)

- API `GET /api/v1/qualiopi/formations/{id}` (`app/handler/qualiopi_ecrans.py`, lecture qualité) : par indicateur, l'état
  calculé (`readiness_of`) sur les contrôles de la formation et de ses sessions, le détail de chaque contrôle,
  les preuves rattachées à la formation ou à ses sessions, les écarts ouverts. Les éléments de l'organisme
  restent dans le carnet. Test : `test_vue_qualiopi_d_une_formation`.
- Onglet « Qualiopi » de la fiche formation (`components/catalogue/formation-qualiopi.tsx`), visible avec
  `read_quality` : synthèse, indicateurs dépliables (contrôles, constaté, manques, lien vers le carnet),
  écarts ouverts, preuves.
- Suite : pages des autres sections et accueils de module sur le même modèle.

## 5 terdecies. Pages des sections RH, Qualité et Qualiopi (13/10/2026)

- Gabarit commun `components/page/section-landing.tsx` (bandeau, KPI, graphiques fournis par la page,
  « À traiter » + carte « Moteur Qualiopi », une carte par module). `/formation` l'utilise aussi.
- Nouvelles pages : `/rh`, `/qualite`, `/qualiopi` (déclarées par `path` sur leur section du menu).
- `NavItem.draft` marque les entrées sans écran (route de cadrage `[...slug]`) : badge « À construire » sur
  les cartes de module et l'accueil global. Retirer `draft` quand l'écran est créé.
- `lib/months.ts` : fenêtre de mois et comptage par mois pour les courbes.
- Restent sans page de section : Pilotage (le tableau de bord en tient lieu), Clients & financement et
  Parcours apprenant (la plupart de leurs modules sont encore à construire), Administration.

## 5 quattuordecies. Assistant IA relié au moteur Qualiopi (26/10/2026)

Serveur MCP en lecture seule `POST /api/v1/mcp` (8 outils : état des indicateurs, fiche indicateur, preuves, écarts,
échéances, actions correctives, synthèse de session), déclaré automatiquement dans l'espace WeKnora à l'ouverture de session
IA ; compte technique `assistant_ia` (`quality.read` seulement) ; base « Référentiel Qualiopi » par
`python -m app.cmd.cli ia-preparer` (65 textes officiels déposés, indexation en attente d'un modèle d'embedding dans le
moteur IA). Détail : `docs/API.md`, section « Moteur IA et serveur MCP ».
Durcissement (audit de sécurité) : `POST /ia/session` exige la permission `ia.use` ; le navigateur reçoit un compte
WeKnora **contributeur** distinct (le compte de service propriétaire reste côté serveur) et **aucun jeton de
renouvellement** (le front rappelle `/ia/session`, qui revérifie le compte GSMS) ; inscription WeKnora fermée
(`DISABLE_REGISTRATION=true`, voir « Première installation » dans `docs/API.md`). Point ouvert : régler les modèles du
moteur IA demande le compte de service, faute d'écran d'administration côté GSMS.

## 5 quindecies. Préinscriptions du site, backend (26/10/2026, chantier C9)

Le formulaire de la landing poste vers `POST /api/v1/public/preinscriptions` (au lieu de `/api/preinscriptions`, absent) ;
table `formation.preinscription` (migration `0021`), traitement `/api/v1/preinscriptions` (liste, détail, statut, conversion
en stagiaire inscrit par `training.service.enroll`), permissions `leads.read` / `leads.write` (gestion ; `leads.read` seul pour
financement, pas pour le rôle « lecture »), 4 demandes d'exemple dans `seed-demo`. Page 4 du back-office : à faire. Détail : `docs/API.md`,
section « Préinscriptions ».

## 5 sexdecies. Audit CodeRabbit du backend (26/10/2026)

Envoi des relances verrouillé (`skip_locked`, pas de double envoi), titres et
actions de développement des formateurs réévalués à l'événement (`payload.trainer_ids`, aussi depuis la fiche RH), pièce
retirée de `config/dossiers` ignorée par le moteur, chaînes CSS des documents A4 échappées (`<`, `>`, `&`), six mois
calendaires exacts dans la synthèse des devis, échéances des sessions d'exemple supprimées avec elles.

## 5 septdecies. Patrons de page, menu par sections et pages Qualiopi (26/10/2026, chantier C1)

- Composants partagés `app/src/components/gsms/` : `GsmsPageHeader`, `GsmsSectionLanding` (niveau 1), `GsmsListPage`
  (niveau 2 : tableau ≥ 768 px, cartes sur téléphone, pagination), `GsmsRecordSheet` (niveau 3), `GsmsKpiRow`,
  `GsmsModuleCard`, `GsmsAlertList`, `GsmsActionGate`, `GsmsRefusal`, `GsmsStatusTag`, `GsmsStepMark`, `GsmsPersonAvatar`,
  plus `GsmsFilterTabs`, `GsmsRowActions`, `ActionDialog` (saisies `a_saisir`), `GridPoints`, `AttendanceSheetView`,
  `useApiSource`, `format.ts` (libellés `gsms.etats.*`, refus 403/409 lisibles).
- Menu par sections (`config/gsmsMenu.ts`) : les 42 pages du CDC y sont prévues ; une entrée n'apparaît que si sa route
  existe et que `GET /bootstrap` l'ouvre. Sur téléphone (< 768 px) le menu devient un tiroir (barre du haut).
- Pages : Pilotage (vue d'ensemble = tableau de bord), Qualiopi (vue d'ensemble), indicateurs et fiche, carnet d'audit
  (version imprimable téléchargée, jamais injectée), preuves et fiche (validation), constats et actions, audits et fiche,
  réclamations, veille, dossier de l'organisme, journal ; commencées pour C4 : sessions, fiche session (inscriptions,
  cycle de vie, parcours, émargement, activité), parcours d'une inscription, émargement. Textes `gsms.<domaine>.…`.

## 5 octodecies. Planning, évaluations des acquis, aide au BPF, backend (26/10/2026, chantier C11 et page 14)

Sans migration : `GET /planning` (créneaux, 93 jours au plus, portée formateur, conflits formateur / salle signalés sans
blocage), `GET /evaluations-acquis` (composé des registres du parcours), `GET /bilans` (inventaire des rapports) et
`GET /bilans/bpf?exercice=` (**aide** au BPF, cadres marqués calculé / indicatif / partiel / non calculable ; sources
`docs/bilans/SOURCES.md`). Tests `tests/test_pilotage.py`. Back-office (pages 2, 3, 14, 15) :
`planning` (semaine en grille CSS, liste ; jour par jour sur téléphone ; conflits de l'API, sans bibliothèque de calendrier),
`rapports` (inventaire `GET /bilans`, carnet téléchargé en fichier) et `rapports/bpf` (cadres et avertissement de l'API),
`evaluations` (`GET /evaluations-acquis`, actions gouvernées) et `satisfaction` (`/surveys`). Manque côté API : filtres et
`capabilities` sur `/surveys`. Reste : un écran pour `GET /formation/resultats`.

## 5 novodecies. Facturation, backend (26/10/2026, chantier C10)

Factures, avoirs et encaissements (`app/handler/invoicing.py`, `/api/v1/factures`, `/api/v1/encaissements`, schéma
`facturation`, migration 0022), module `invoicing` **désactivé par défaut** ; droits `invoices.read`, `invoices.write`,
`invoices.issue`, `payments.write`. Numéro attribué à l'émission (`FA-AAAA-NNNN`, avoirs `AV-AAAA-NNNN`, sans trou),
pièce figée (SHA-256 + déclencheur PostgreSQL), correction par avoir plafonné au restant, montants en centimes.
Sources réglementaires et part « choix de GSMS » : `docs/facturation/SOURCES.md`. Démo : séries `DEMO-FA`/`DEMO-AV`
retirées par `retirer-demo`. Reste : pages 19 et 20 du front, relances de paiement, facture électronique.
Front (C8 + C10, 26/10) : `views/gsms/finances/` (vue d'ensemble, dossiers de financement et fiche, factures et avoirs et fiche, encaissements), `api/gsms/invoicing.ts` ; vérifications et capacités de l'API affichées telles quelles, aperçu A4 téléchargé ; modules `funding` et `invoicing` activés dans la base de dev. Reste : relances de paiement, facture électronique (aucune route).

## 5 vicies. Durcissement des routes publiques (26/10/2026, audit de sécurité)

Limites de débit en mémoire (`app/common/limites.py`, mono-instance, 429 en français) sur la connexion (adresse et e-mail),
`/public/*`, l'émargement et les préinscriptions ; empreinte bcrypt factice pour un e-mail inconnu ; liens de documents datés
(60 jours, clé dérivée, anciens liens lus 60 jours après l'émission du document) ; `/openapi.json` fermé en production ;
verrou `FOR UPDATE` sur la réponse à un questionnaire ; fastapi 0.141.1 + starlette 1.7.0 figée ; Caddy plafonne le corps
à 20 Mo. Détail : `docs/API.md` §1.

## 5 vicies. Offre de formation et apprenants (26/10/2026, chantier C5)

Back-office : vue d'ensemble École (`/platform/ecole`), catalogue (`formations`), fiche formation (programme, certification et
vérifications, contenus, versions et programme imprimable, suivi pédagogique ; boutons selon `capabilities`), référencement CPF
(`edof`, dossier `edof/dossiers/:id` : anomalies, pièces, instruction, cycle de vie), stagiaires et fiche (parcours, documents,
financement si le module est actif), registres du parcours (`parcours/:vue`). Manque côté API : la liste des inscriptions d'un
stagiaire (la fiche les relève dans `GET /sessions/{id}`), le dépôt de pièce EDOF et la gestion des intervenants et ressources
ne sont pas encore à l'écran.

**Commercial (26/10/2026, C7 + page 4 de C9)** : `views/gsms/commercial/` — demandes (`demandes`, filtre et compteurs de l'API, fiche avec déclarations horodatées, prise en charge, refus motivé, conversion avec `sessions_proposees`, réservé à `leads.*`), devis (`devis`, création, lignes, titre et validité, circuit selon `capabilities`, aperçu A4 téléchargé, versions), entreprises (`entreprises`, CRUD, fiche avec stagiaires et devis) ; modules ajoutés à la vue d'ensemble École. Manque côté API : filtres par entreprise (`/learners`, `/editions`), devis dans `seed-demo`, édition des sections d'un devis à l'écran.

**Jetons et lectures manquantes (26/10/2026, backend)** : version de jeton par compte (`iam.user.token_version`, migration 0023, `ver` + `iat` dans le JWT, 401 « Session révoquée ») incrémentée au changement de mot de passe (qui rend un jeton neuf), à la désactivation et par `POST /auth/me/deconnexion-partout` ; pas au changement de rôles (droits relus à chaque requête) ; jeton `mcp` inchangé. Lectures ajoutées : `GET /learners/{id}/inscriptions`, filtres `entreprise` (`/learners`, `/editions`), `type` (`/editions`), `formateur` (`/sessions`, `/trainer-qualifications`, `/staff-development`), `titre_id` dans `/rh/echeances`, `GET /listes-de-valeurs`, `GET /qualiopi/circuit`, `GET /financement/regles`. Tests `test_revocation_jetons.py`, `test_routes_lecture.py` ; écrans pas encore branchés.

**Communication (26/10/2026, C12)** : `views/gsms/communication/` — vue d'ensemble (`communication` : compteurs, à valider et échecs, état de l'envoi, moteur pour les indicateurs des règles), messages et relances (`messages` : onglets par statut avec les compteurs de l'API, fiche en tiroir avec texte brut et aperçu HTML téléchargé, valider, rejeter/annuler avec motif, renvoyer, planifier maintenant ; module désactivé → refus lisible ; rappel « délais par défaut, pas des obligations »), documents (`documents` : documents stockés rattachés aux preuves via `GET /qualiopi/preuves`, filtres type et sujet, téléchargement fetch + blob). Manque côté API : liste transverse `GET /documents` (documents hors preuve), `capabilities` par message (les boutons suivent le statut, l'API reste juge), fichiers absents pour deux justificatifs de la démo (404).

**Démo complétée (26/10/2026, C13)** : `seed-demo` ajoute la formation MAC-SST (vignette : celle du SST, `thumbnail.ts`), 7 lieux et salles en `DEMO-` (capacité, accessibilité, une antenne « à vérifier »), 7 équipements (une vérification échue, une dans 12 jours), 2 sous-traitants (un certifié, un vérifié non certifié), partenaires handicap et socio-économiques, 4 fiches RH (contrats, une absence ; Julie Martin, intervenante extérieure, sans fiche), titres (H0B0 de Karim Benali à renouveler dans 45 jours), actions de développement, enquêtes entreprise, formateur et financeur, 4 dossiers de financement (OPCO, entreprise, CPF, créés seulement si le dispositif est actif) et deux sessions à venir dans la même salle (SST-2026-05, MAC-SST-2026-01 : un conflit au planning). Trous plantés inchangés ; `retirer-demo` retire tout (`test_demo.py`). `funding.apply` accepte un acteur système (`None`).

## 6. Prochaine étape : nouveau front (Vue 3 + TDesign)

L'ancien front Metronic a été retiré le 26/10/2026 : le propriétaire le jugeait brouillon. Le nouveau
sera fait en **Vue 3 + TDesign**, avec la même coquille et la même ergonomie que le back-office
Global-IT-SS (kit dérivé de WeKnora : menu latéral, panneau Paramètres).

Points de départ :

- `docs/API.md` : routes HTTP par module (méthode, chemin, droits) et entités de paramétrage à
  regrouper dans le panneau Paramètres ;
- navigation construite depuis `GET /api/v1/bootstrap` (modules actifs, permissions), jamais en dur ;
- le front n'affiche que les décisions de l'API (capacités, refus motivés `Decision`) ;
- pages publiques par lien signé à refaire (questionnaires, espace du stagiaire), adresse du front dans
  `PUBLIC_URL` ;
- en production, Caddy ou Traefik publient aujourd'hui l'API seule (`deploy/`) : y remettre le front
  quand il existera.

## 7. Reste à faire (ordre proposé)

1. Écran « Communications » : messages à valider, annuler, renvoyer, aperçu exact (l'API existe :
   `/api/v1/communications*`).
2. Modèles Jinja manquants (même principe que `config/documents_generes/`) :
   - **certificat de réalisation** (demandé par les financeurs) ;
   - feuille d'émargement ;
   - convention ou contrat de formation ;
   - ~~programme de formation~~ : fait le 02/10 (rédigé depuis une version validée de la fiche).
3. Sortie PDF des documents.
4. Écran chaîne Qualiopi (critères, indicateur, actions correctives ; l'API existe).
5. **Landing de Form'SSI** : c'est la vitrine de l'école avec son catalogue de formations, alimentée
   par les programmes. **Pas** une page qui vend le logiciel.

## 8. Conventions de travail

- Commits en français, message au présent, corps qui explique le « pourquoi ».
- Toute nouvelle table passe par une migration Alembic autogénérée puis relue ; `alembic check` doit
  rester propre.
- Tout nouveau comportement métier vient avec son test pytest sur un vrai PostgreSQL.
- Tout nouvel écran (nouveau front) vient avec son test de bout en bout (ordinateur et mobile) et une capture relue.
- Les réglages et modèles de texte vont dans `config/` (YAML, Jinja), pas en dur dans le code.
