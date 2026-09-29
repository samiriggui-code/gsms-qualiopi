# GSMS Qualiopi — travail en cours (GELÉ)

> **Statut : gelé en attente de l'audit SchoolOps / Mizan / ai-agent-education-platform.**
> Ce dépôt contient un premier jet de backend, poussé pour relecture. Il n'est ni terminé ni testé.
> Aucune décision d'architecture n'est figée tant que l'audit n'est pas validé.

## Ce qui existe

Backend Python (`backend/`) : FastAPI, SQLAlchemy 2, Alembic, PostgreSQL. Trois schémas : `iam`, `formation`, `qualite`.

| Module | Contenu | État |
| --- | --- | --- |
| `app/training/models.py` | Domaine organisme de formation : organisme, entreprises, apprenants, formateurs, qualifications, programmes, sessions, inscriptions, analyse du besoin, positionnement, convocations, conventions, émargements, évaluations, attestations, satisfaction, réclamations, veille, sous-traitants, partenaires, documents versionnés | Modèles écrits, migration générée |
| `app/events/` | Outbox PostgreSQL + catalogue d'événements | Écrit |
| `referentials/qualiopi/v9/` | Source : 32 fichiers de Levier-IA/qualiopi-markdown (Etalab 2.0), commit amont figé. Couche normative : `normative/v9.yaml` (applicabilité, preuves attendues, contrôles) | Écrit, l'import parse et valide les 32 indicateurs |
| `app/qualiopi/referential/` | Import versionné avec empreintes SHA-256, activation d'une version | Écrit |
| `app/qualiopi/evidence/` | Detectors données → preuves, statuts DETECTEE / DOCUMENTEE / EXPLOITABLE / VALIDEE / EXPIREE / REJETEE / RETIREE, historique, validation humaine | Écrit, non testé |
| `app/qualiopi/evaluation/` | Bibliothèque de 9 contrôles paramétrés, runner, constats, dossier d'audit de session | Écrit, non testé |
| `app/qualiopi/audit/`, `capa/` | Audit figé et comparable, cycle CAPA avec vérification par réévaluation | Écrit, non testé |
| `app/auth/` | JWT + rôles (admin, qualite, gestion, lecture) | Écrit |

Manque : routeurs FastAPI (en partie), `main.py`, données de démo, tests, front Next.js, Docker.
