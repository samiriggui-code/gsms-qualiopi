# GSMS Qualiopi

Application de pilotage Qualiopi pour organisme de formation (FORM'SSI) : backend FastAPI + moteur Qualiopi, front Next.js basé sur le concept CRM de Metronic.

> **Statut : en développement.** Le gel lié à l'audit SchoolOps / Mizan / ai-agent-education-platform est levé.

## Démarrer en local

Prérequis : PostgreSQL (base `gsms_qualiopi`, `postgres/postgres` par défaut), Python 3.12+, Node 20+.

```bash
# Backend — http://localhost:8000
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Linux/Mac : .venv/bin/pip
.venv/Scripts/alembic upgrade head
.venv/Scripts/uvicorn app.main:app --reload --port 8000

# Front — http://localhost:3000
cd frontend
npm install --force
npm run dev
```

Au premier démarrage, l'API crée un compte admin si la base est vide : `admin@gsms.local` / `admin-gsms` (variables `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

## Front (`frontend/`)

Next.js 16, Tailwind 4, composants ReUI. Layout adapté du **concept CRM de Metronic** (Metronic React Concepts 9.5.0) : barre du haut, sidebar repliable, en-tête de contenu fixe par page.

- `components/ui/` : bibliothèque commune Metronic (tableaux `data-grid`, graphiques, agenda `calendar/`, `kanban`, formulaires, panneaux `sheet`…).
- `components/layout/` : layout CRM (header, sidebar, `ContentHeader` + `Content` à utiliser dans chaque page).
- `config/menu.config.ts` : navigation (entrées à plat + sections repliables Formation, Qualiopi, Administration ; champ `new` = raccourci du bouton « Nouveau »).
- `app/(app)/` : pages de l'application. `[...slug]` affiche une page provisoire pour chaque entrée du menu sans écran dédié.
- `app/(app)/demo/` : **catalogue de référence**, hors menu (accès direct : `/demo/crm/dashboard`, `/demo/crm/tasks`, `/demo/crm/notes`, `/demo/crm/contacts`, `/demo/crm/companies`, `/demo/crm/company`, `/demo/calendar`, `/demo/kanban`), **à supprimer avant la mise en production**. Contient le CRM complet (dashboard, tasks, notes, contacts, companies, company), l'agenda et le kanban, avec leurs données fictives. Méthode : copier l'écran voulu dans `app/(app)/…`, remplacer les données fictives par un hook branché sur l'API, traduire.
- `app/(auth)/signin` : connexion, branchée sur `POST /api/v1/auth/login`. En dev, identifiants admin préremplis.
- Authentification : le JWT de l'API est stocké dans un cookie httpOnly (`/api/auth/login`, `/api/auth/logout`). Les appels à l'API passent par le proxy `/api/backend/...` qui ajoute le Bearer (`lib/api.ts`). `proxy.ts` redirige vers `/signin` sans session.
- Pas d'inscription ni de réinitialisation de mot de passe : les comptes sont créés par un admin (`POST /api/v1/auth/users`).

### Autres concepts Metronic (non copiés)

Source : `C:/laragon/www/themeforest-…/metronic-v9.5.0/metronic-tailwind-react-concepts/typescript/nextjs/app/`. À piocher au besoin :

| Concept | Intérêt pour l'app |
| --- | --- |
| `store-inventory` | Formulaires en panneau latéral (`components/*-form-sheet.tsx`), fiches détail avec onglets et historique d'activité (`components/customers/`), modale de paramètres à onglets (`settings-modal`), upload d'images |
| `todo` | Listes par échéance/priorité avec cartes de stats (`today/`, `upcoming/`, `priority/`) → suivi des actions correctives |
| `mail` | Rédaction de message (`components/layouts/mail/components/compose-message.tsx`) → envoi de convocations |
| `ai`, `real-estate` | Peu utiles (chat IA, carte Leaflet) |

Attention : chaque concept a son propre layout, et certains composants « communs » en dépendent (ex. l'agenda importait un bouton du layout Calendar, retiré ici).

## Backend (`backend/`)

FastAPI, SQLAlchemy 2, Alembic, PostgreSQL. Trois schémas : `iam`, `formation`, `qualite`. Point d'entrée : `app/main.py`. Routeurs branchés : auth, référentiel (`/api/v1/referentials/active`, `/active/indicators`, `/active/indicators/{n}`, `POST /import`). Au démarrage, le référentiel Qualiopi V9 est importé et activé s'il n'y a aucune version active.

| Module | Contenu | État |
| --- | --- | --- |
| `app/training/models.py` | Domaine organisme de formation : organisme, entreprises, apprenants, formateurs, qualifications, programmes, sessions, inscriptions, analyse du besoin, positionnement, convocations, conventions, émargements, évaluations, attestations, satisfaction, réclamations, veille, sous-traitants, partenaires, documents versionnés | Modèles écrits, migrations appliquées |
| `app/events/` | Outbox PostgreSQL + catalogue d'événements | Écrit |
| `referentials/qualiopi/v9/` | Source : 32 fichiers de Levier-IA/qualiopi-markdown (Etalab 2.0), commit amont figé. Couche normative : `normative/v9.yaml` (applicabilité, preuves attendues, contrôles) | Écrit, l'import parse et valide les 32 indicateurs |
| `app/qualiopi/referential/` | Import versionné avec empreintes SHA-256, activation d'une version, routeur de consultation | Fonctionne (écran Qualiopi › Indicateurs) |
| `app/qualiopi/evidence/` | Detectors données → preuves, statuts DETECTEE / DOCUMENTEE / EXPLOITABLE / VALIDEE / EXPIREE / REJETEE / RETIREE, historique, validation humaine | Écrit, non testé |
| `app/qualiopi/evaluation/` | Bibliothèque de 9 contrôles paramétrés, runner, constats, dossier d'audit de session | Écrit, non testé |
| `app/qualiopi/audit/`, `capa/` | Audit figé et comparable, cycle CAPA avec vérification par réévaluation | Écrit, non testé |
| `app/auth/` | JWT + rôles (admin, qualite, gestion, lecture), routeur branché | Fonctionne (connexion testée depuis le front) |

## Manque

- Backend : routeurs métier (formation, référentiel, preuves, évaluation, audit, CAPA), données de démo, tests.
- Front : écrans métier (seul Qualiopi › Indicateurs est construit, le reste est en pages provisoires).
- Docker.
