# GSMS Qualiopi

Backend Python d'un organisme de formation : domaine formation + moteur de préparation Qualiopi.
Le moteur transforme les données du quotidien (inscriptions, positionnements, émargements,
évaluations…) en preuves traçables, les confronte au référentiel national qualité (V9, puis V10 au
1er novembre 2026) et explique
chaque écart. Il ne prononce jamais de conformité : seul l'organisme certificateur en décide.

**Statut : jalons 1 et 1 bis terminés, jalon 2 en cours (socle de configuration, Formation et Émargement faits)** — socle exécutable et prouvé (API, moteur, démo, 120 tests, Docker, CI)
et les cinq briques manquantes du moteur. Pas encore de routeurs métier ni de frontend : c'est le jalon 2.

## Architecture

Un monolithe, un worker, une base.

- `api` (FastAPI) : écrit les données métier et les décisions humaines, publie un événement dans la
  même transaction (`formation.outbox_event`).
- `worker` : lit l'outbox (`FOR UPDATE SKIP LOCKED`), réconcilie les preuves et réévalue uniquement
  le périmètre touché ; passe complète chaque nuit pour le temps qui passe (expirations, délais).
- PostgreSQL, trois schémas : `iam`, `formation` (domaine), `qualite` (moteur).

| Module | Rôle |
| --- | --- |
| `app/training/` | Domaine organisme de formation (25 entités) ; sessions : cycle de vie par transitions (`lifecycle.py`), `TrainingPolicy`, capacités motivées (`GET /api/v1/sessions/{id}/capabilities`), routes sessions et inscriptions |
| `app/qualiopi/referential/` | Import versionné : texte officiel + couche normative (`v9.yaml`, `v10.yaml`), bascule à la date d'entrée en vigueur |
| `app/qualiopi/evidence/` | Donnée → preuve : détecteurs, cycle de vie, validation humaine, historique |
| `app/qualiopi/evaluation/` | 9 contrôles paramétrés, états de préparation, constats, dossier de session |
| `app/qualiopi/audit/`, `capa/` | Audit interne figé et comparable ; CAPA clôturée seulement si le contrôle passe |
| `app/events/`, `app/qualiopi/engine.py`, `app/worker.py` | Outbox et réévaluation ciblée |
| `app/qualiopi/schedule/` + `config/circuits/` | Échéancier : jalons J-15 → J+45 par session, à venir / à échéance / en retard |
| `app/documents/` + `config/dossiers/` | Dossiers de pièces : dépôt SHA-256 ou pièce papier déclarée, versions, demandes, trames de rédaction ; chaque pièce a une grille cochée au dépôt (exploitable si tous les points sont satisfaits) puis confirmée à la validation |
| `app/auth/` | Catalogue de permissions `ressource.action` (code), rôles système + rôles créés par l'organisme (base), plusieurs rôles par compte ; on ne donne jamais un droit qu'on n'a pas |
| `app/attendance/` | Émargement électronique : demi-journées générées depuis les réglages, signature du stagiaire avec le code de salle (QR) + son lien personnel dans la fenêtre horaire, absences constatées et motivées par le formateur, contre-validation qui verrouille ; règle unique « qui est attendu » partagée avec la clôture et le moteur Qualiopi |
| `app/platform/` | Socle de configuration : fonctionnalités activables (une fonctionnalité inactive retire ses droits), réglages typés déclarés par chaque domaine, datés et journalisés (`ConfigurationService`), décisions motivées (`Decision`), `GET /api/v1/bootstrap` pour le front |
| `app/qualiopi/review/` | Revue humaine attestée par indicateur (conclusion, justification, validité) |
| `app/qualiopi/cycle/` | Cycle de certification : période évaluée pour l'état global et l'échantillon d'audit |
| `app/core/journal.py` | Journal des modifications métier : qui, quoi, quand, champ par champ |

## Démarrer en local

Prérequis : Python 3.11+, PostgreSQL 16.

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gsms
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
alembic upgrade head
python -m app.cli create-admin admin@exemple.fr "Administrateur"   # mot de passe demandé
python -m app.cli seed-demo          # organisme de démo, 15 trous et 8 jalons plantés
uvicorn app.main:app --reload        # API sur :8000, documentation sur /docs
python -m app.worker                 # dans un second terminal
```

Dossier d'audit d'une session (avec son échéancier) : `GET /api/v1/sessions/{id}/dossier`.
État de préparation global sur le cycle en cours : `GET /api/v1/qualiopi/readiness`.
Échéances proches ou dépassées : `GET /api/v1/qualiopi/echeances`.

## Docker

```bash
cp .env.example .env    # renseigner POSTGRES_PASSWORD et JWT_SECRET (obligatoires)
docker compose up -d --build
docker compose exec api python -m app.cli create-admin admin@exemple.fr "Administrateur"
docker compose exec api python -m app.cli seed-demo
```

`APP_ENV=production` (défaut du compose) refuse de démarrer avec un secret faible, un CORS `*`
ou le mot de passe PostgreSQL par défaut.

## Tests

Les tests tournent sur un vrai PostgreSQL : une base neuve est créée et migrée par Alembic.

```bash
export TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres
python -m pytest
ruff check .
alembic check           # le schéma migré doit correspondre aux modèles
```

`tests/test_demo.py` et `tests/test_schedule.py` sont le contrat du moteur : sur la démo, il trouve
exactement les 15 trous plantés (`PLANTED_GAPS`) et les 8 jalons en retard ou à échéance
(`PLANTED_MILESTONES`), avec l'apprenant ou la pièce en cause, et rien d'autre.

## Référentiel

Chaque version est un dossier `backend/referentials/qualiopi/vN/` : `source/` (texte officiel) et
`normative/vN.yaml` (couche GSMS : applicabilité, preuves attendues, contrôles). Une version dont la
date d'entrée en vigueur n'est pas atteinte est importée inactive ; la passe de nuit du worker active
la plus récente version en vigueur.

| Version | En vigueur | Source |
| --- | --- | --- |
| V9 | jusqu'au 31/10/2026 | 32 fichiers de [Levier-IA/qualiopi-markdown](https://github.com/Levier-IA/qualiopi-markdown) (Licence Ouverte Etalab 2.0, commit figé dans `UPSTREAM_COMMIT`), transcription du guide de lecture V9 |
| V10 | à partir du 01/11/2026 | 33 énoncés de l'annexe du [décret n° 2026-728 du 1er août 2026](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054608509) (Légifrance, référence dans `UPSTREAM_REF`) |

Le guide de lecture V10 n'était pas publié au 29/09/2026 : la couche `v10.yaml` reprend les contrôles
V9, ajoute ceux des nouvelles exigences (indicateur 12 : violences, harcèlement, discriminations ;
indicateur 32 : analyse des risques) et marque ce qui est provisoire. Les couches normatives sont
propres à GSMS et doivent être relues par un responsable qualité face aux textes officiels
([guide de lecture](https://travail-emploi.gouv.fr/referentiel-national-qualite-guide-de-lecture-qualiopi)),
seuls à faire foi.

Code tiers repris : voir `THIRD_PARTY_NOTICES.md`.
