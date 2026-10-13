# Handoff — GSMS Qualiopi (reprise en local)

Dernière mise à jour : 05/10/2026 (parcours EDOF fusionné dans `main` ; données réelles de Form'SSI complétées, §5 ter).
À lire en entier avant de toucher au code.

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
  - Un worker (`app/worker.py`) lit l'outbox des événements, réévalue le moteur, planifie et envoie les
    relances.
- **Front** : Next.js 16 (App Router, `proxy.ts` et non `middleware.ts`, `params` asynchrones),
  Tailwind 4 avec tokens CSS, Radix, TanStack Query.
  - BFF : `/api/auth/login` pose le cookie httpOnly `gsms_session`.
  - `/api/gsms/[...path]` relaie les appels avec le jeton.
  - `/api/public/[...path]` relaie sans session, pour les liens signés uniquement.
  - Lire `frontend/AGENTS.md` : cette version de Next diffère de ce que tu connais.
- **Motifs du moteur, à réutiliser partout** :
  - `Decision` / `PolicyDenied` (409 `{error, detail, details}`), capacités par objet ;
  - réglages datés (`ConfigurationService`, registre dans `app/platform/settings.py`) ;
  - fonctionnalités activables (`app/platform/features.py`) ;
  - catalogue de permissions (`app/auth/permissions.py`) ;
  - événements outbox (`publish`), journal des modifications, références `next_reference(db, prefix)`.

Détail des modules : `README.md`. Détail du front : `frontend/README.md`.

## 4. Démarrer et vérifier

```bash
# Backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gsms
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
alembic upgrade head && python -m app.cli seed-demo
# seed-demo marche aussi sur une base déjà importée (Form'SSI, GSMS School) : les exemples (sessions,
# apprenants, formateurs, réclamations… créés par « démo ») rejoignent l'organisme existant sans le modifier.
# python -m app.cli retirer-demo les retire tous avant la mise en service réelle.
uvicorn app.main:app --reload          # :8000, doc sur /docs
python -m app.worker                   # second terminal

# Front
cd frontend && npm install && GSMS_API_URL=http://127.0.0.1:8000 npm run dev   # :3000
```

E-mails en local : Mailpit (`docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit`,
SMTP sur le port 1025 déjà par défaut, interface http://localhost:8025). Sur le
VPS : un vrai SMTP (`SMTP_*` dans `.env`).

**Vérifications avant chaque commit** (toutes vertes au dernier commit) :

```bash
cd backend && ruff check . && python -m pytest && alembic check        # 182 tests au 02/10
cd frontend && npm run typecheck && npm run lint && npm run format:check && npm run build
npm run test:e2e     # 18 passés, 4 ignorés (écritures sur mobile) ; captures dans e2e-results/captures/
```

Comptes de la base e2e (mot de passe `demo-gsms-2026`) :

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
  **Fait le 30/09** : l'API CRUD de `main` est réintégrée (`app/core/crud.py`, `app/training/resources.py`,
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
    sensibles) ; contrôles `app/edof/checks.py` avec niveau et cible ;
  - cycle **déclaratif** : aucune API de dépôt EDOF n'existe, GSMS ne transmet rien ;
  - permissions `edof.read|write|validate|sensitive`, `programs.validate` ; fonctionnalité `edof`
    (active par défaut) ; les événements `edof.*` ne relancent pas le moteur Qualiopi ;
  - `python -m app.cli import-formssi` : identité de Form'SSI et formation TFP APS, sans rien écraser.
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

- **API** `app/qualiopi/ecrans.py` (lectures prêtes à afficher, décisions motivées) :
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

- **Import** `python -m app.cli import-gsms-school` (`app/training/import_school.py`) lit
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
- **API** `app/training/offre.py` : `GET /formation/resultats?mois=` (réussite à l'examen, abandons,
  satisfaction à chaud mesurés par formation, écarts avec les taux publiés), `POST
  /formation/resultats/{id}/publication` (refus motivé `NOTHING_MEASURED`), `GET /formation/ressources`.
  CRUD `premises` et `equipment` (`app/training/resources.py`). Tests : `tests/test_offre_formation.py`.
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
  le carnet d'audit sont dans `app/core/rendu_a4.py` ; le carnet n'a pas changé (sortie identique octet pour octet).
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

## 6. Prochaine étape : front avec Metronic

Le propriétaire a une licence Metronic et l'utilise dans GSMS-School-Aps (demo1). Pour GSMS Qualiopi,
deux démos ont été proposées :

- **Demo 4** : rail d'icônes et menu contextuel par module ;
- **Demo 6** : barre latérale moderne avec recherche et favoris.

Demo1 reste possible. Le choix final revient au propriétaire.

**Où mettre la démo** :

- en local dans `research/` à la racine de ce dépôt. Ce dossier est **ignoré par git** (`.gitignore`) :
  il ne sera jamais publié ;
- ou dans le dépôt privé `samiriggui-code/metronic`.

**Avant d'intégrer du code Metronic dans `frontend/`**, il faut soit rendre `gsms-qualiopi` privé, soit
garder le front Metronic dans un dépôt privé. À trancher avec le propriétaire avant le premier commit
qui contient du Metronic.

**Méthode recommandée**

1. Lire la démo dans `research/` et relever sa structure : layout, sidebar, header, tokens, composants.
2. Garder tel quel tout ce qui fait marcher l'application :
   - BFF et cookie ;
   - `src/lib/api.ts`, `types.ts`, `labels.ts` ;
   - les requêtes TanStack (`features/*/queries.ts`) ;
   - `ActionGate` ;
   - les états renvoyés par l'API ;
   - les tests e2e.

   **Seule la couche visuelle change** : AppShell, composants `ui/`, tokens.
3. Brancher la couleur de l'organisme (`general.brand_color`, via `/bootstrap`) sur la couleur
   principale de Metronic.
4. Construire la navigation depuis `/bootstrap` (modules actifs et permissions), jamais en dur.
5. Refaire passer `npm run test:e2e` (ordinateur et mobile, axe-core, débordement) et relire les
   captures.

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
- Tout nouvel écran vient avec son test Playwright (ordinateur et mobile) et une capture relue.
- Les réglages et modèles de texte vont dans `config/` (YAML, Jinja), pas en dur dans le code.
