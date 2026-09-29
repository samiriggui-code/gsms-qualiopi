# Handoff — GSMS Qualiopi (reprise en local)

Dernière mise à jour : 29/09/2026. Branche de travail : `claude/publish-gsms-qualiopi-v0ta5n`
(dernier commit : `7d7531d`). À lire en entier avant de toucher au code.

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

- **Backend** : FastAPI, SQLAlchemy 2, Alembic (migrations `0001` → `0016`), PostgreSQL 16,
  Pydantic 2, Jinja2.
  - Schémas : `iam`, `config`, `formation`, `qualite`, `rh`, `financement`, `communication`.
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
cd backend && ruff check . && python -m pytest && alembic check        # 155 tests
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
- Pages et composants Metronic à récupérer : `C:/laragon/www/gsms-school/apps/lms-crm` (171 pages, dont
  23 pages Qualiopi).
- Local : base `gsms_qualiopi` recréée avec ces migrations (l'ancienne est gardée en
  `gsms_qualiopi_old`) ; administrateur `admin@gsms.local` / `admin-gsms-2026` (préremplis en dev).

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
   - programme de formation.
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
