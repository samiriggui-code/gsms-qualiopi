# GSMS Qualiopi

Application d'un organisme de formation : backend Python (domaine formation + moteur de préparation
Qualiopi), exposé par une API HTTP.

> **Refonte du front en cours** (26/10/2026) : l'ancien front Next.js/Metronic a été retiré volontairement
> (consultable dans l'historique git, commit `814e838`). Le dépôt suit désormais la **structure standard des
> applications Global-IT-SS** (même coque que `global-it-ss-template`) : back-office Vue 3 + TDesign sur `/app/`,
> landing sur `/`, API sur `/api/`. Routes et entités de paramétrage : [`docs/API.md`](docs/API.md).

## Structure du dépôt

| Dossier | Rôle | Base |
|---|---|---|
| `app/` | **Back-office**, servi sur `/app/` : coque Global-IT-SS (menu, panneau Paramètres, connexion) + écrans Qualiopi | Coque du template Global-IT-SS (WeKnora : Vue 3, TDesign Vue Next) |
| `backend/` | **API métier** : FastAPI (formation + moteur Qualiopi), worker outbox, migrations, tests | GSMS Qualiopi |
| `landing/` | Site public, servi sur `/` (contenu du template, à adapter) | Landing du template (Next.js 16) |
| `theme/` | Marque : logos, couleurs, polices (`tokens.css`) | Template Global-IT-SS |
| `scripts/` | Lancement local sur une seule adresse (`dev.sh`) | Template Global-IT-SS |
| `deploy/` | Mise en production (compose, Caddy ou Traefik) | — |
| `docs/` | Documentation (`API.md`, EDOF) | — |

Lancement local : l'API tourne (voir plus bas), puis `./scripts/dev.sh` → http://localhost:4150
(depuis un autre appareil du réseau : `http://<IP du PC>:4150`).

Licences : la coque et la landing dérivent de Tencent/WeKnora, sous licence MIT (`LICENSE-WeKnora`).

Le moteur transforme les données du quotidien (inscriptions, positionnements, émargements,
évaluations…) en preuves traçables, les confronte au référentiel national qualité (V9, puis V10 au
1er novembre 2026) et explique
chaque écart. Il ne prononce jamais de conformité : seul l'organisme certificateur en décide.

**Statut : jalons 1 et 1 bis terminés, jalon 2 en cours** — backend : socle de configuration, Formation,
Émargement, RH, Financement, Parcours du stagiaire, chaîne Qualiopi, actions correctives, relances, questionnaires en ligne, fiche formation versionnée et référencement EDOF (225 tests). Front : coque Global-IT-SS en place, écrans à construire.

## Architecture

Un monolithe, un worker, une base.

- `api` (FastAPI) : écrit les données métier et les décisions humaines, publie un événement dans la
  même transaction (`formation.outbox_event`).
- `worker` : lit l'outbox (`FOR UPDATE SKIP LOCKED`), réconcilie les preuves et réévalue uniquement
  le périmètre touché ; passe complète chaque nuit pour le temps qui passe (expirations, délais).
- PostgreSQL, trois schémas : `iam`, `formation` (domaine), `qualite` (moteur).

### Organisation du code (méthode du template Global-IT-SS / Tencent WeKnora)

Le backend est rangé **par couche**, comme `backend/internal/` du template ; chaque couche a un fichier
ou un dossier par domaine. Les chemins ci-dessous sont relatifs à `backend/app/`.

| Couche | Dossier | Contenu |
| --- | --- | --- |
| Points d'entrée | `cmd/` | `server.py` (création de l'API, `uvicorn app.cmd.server:app`), `worker.py`, `cli.py` |
| Routage | `router/` | `rbac.py` : catalogue des permissions `ressource.action` |
| Handlers HTTP | `handler/` | une route FastAPI par domaine : `training.py`, `attendance.py`, `qualiopi.py`, `edof.py`… |
| Services métier | `application/service/<domaine>/` | logique : moteur Qualiopi, détecteurs, cycle de vie, relances… |
| Droits métier | `application/access/` | politiques (`TrainingPolicy`…) : qui peut agir, refus motivés |
| Types | `types/` | modèles SQLAlchemy et schémas, un fichier par domaine ; `registry.py` les charge tous |
| Socle | `middleware/`, `database/`, `config/`, `errors/`, `event/`, `common/` | JWT, session SQL, réglages, erreurs, outbox, journal |
| Migrations | `../migrations/versioned/` | migrations Alembic |

| Domaine | Rôle |
| --- | --- |
| Formation — `handler/training*.py`, `application/service/training/`, `types/training.py` | Domaine organisme de formation (25 entités) ; sessions : cycle de vie par transitions (`lifecycle.py`), `TrainingPolicy`, capacités motivées (`GET /api/v1/sessions/{id}/capabilities`), routes sessions et inscriptions |
| Référentiel — `application/service/qualiopi/referential/` | Import versionné : texte officiel + couche normative (`v9.yaml`, `v10.yaml`), bascule à la date d'entrée en vigueur |
| Preuves — `application/service/qualiopi/evidence/` | Donnée → preuve : détecteurs, cycle de vie, validation humaine, historique |
| Évaluation — `application/service/qualiopi/evaluation/` | 9 contrôles paramétrés, états de préparation, constats, dossier de session |
| Audit, CAPA — `application/service/qualiopi/{audit,capa}/` | Audit interne figé et comparable ; CAPA clôturée seulement si le contrôle passe |
| Outbox — `event/`, `application/service/qualiopi/engine.py`, `cmd/worker.py` | Outbox et réévaluation ciblée |
| Échéancier — `application/service/qualiopi/schedule/` + `config/circuits/` | Échéancier : jalons J-15 → J+45 par session, à venir / à échéance / en retard |
| Dossiers de pièces — `application/service/documents/` + `config/dossiers/` | Dossiers de pièces : dépôt SHA-256 ou pièce papier déclarée, versions, demandes, trames de rédaction ; chaque pièce a une grille cochée au dépôt (exploitable si tous les points sont satisfaits) puis confirmée à la validation |
| Comptes et droits — `router/rbac.py`, `middleware/auth.py`, `handler/auth.py` | Catalogue de permissions `ressource.action` (code), rôles système + rôles créés par l'organisme (base), plusieurs rôles par compte ; on ne donne jamais un droit qu'on n'a pas |
| Émargement — `application/service/attendance/`, `application/access/attendance.py` | Émargement électronique : demi-journées générées depuis les réglages, signature du stagiaire avec le code de salle (QR) + son lien personnel dans la fenêtre horaire, absences constatées et motivées par le formateur, contre-validation qui verrouille ; règle unique « qui est attendu » partagée avec la clôture et le moteur Qualiopi |
| Financement — `application/service/funding/` + `config/financement/` | Financement (modules activables par dispositif) : dossier par inscription, sources multiples (cofinancement au statut calculé, sur-financement bloqué), cinq rôles séparés (bénéficiaire, financeur, signataire, destinataire de facture, payeur) ; circuits CPF, OPCO, France Travail (AIF), entreprise et reste à charge décrits en YAML versionné, conditions nommées lues dans les données existantes, échéances en jours ouvrés (fériés compris), actions de portail tracées, taux de réalisation depuis l'émargement, règles datées sourcées (participation CPF 100 € puis 150 €) |
| Parcours — `application/service/journey/` + `config/documents_generes/` | Parcours du stagiaire : analyse du besoin, positionnement, convention ou contrat (envoi, signature), convocation, évaluations, fin, abandon ou annulation, attestation, satisfaction à chaud et à froid ; chaque étape a sa politique (permission, portée du formateur, état, conditions) et ses refus motivés ; le moteur **rédige** la convocation (horaires tirés des demi-journées, accessibilité) et l'attestation de fin (objectifs, nature L. 6313-1, durée suivie tirée de l'émargement, résultats des évaluations, L. 6353-1), figées par empreinte SHA-256 et versionnées |
| Relances — `application/service/relances/` + `config/relances/` + `config/emails/` | Relances et communications (module activable) : calendrier en YAML (convention à signer J-15/J-10/J-7, rappel J-2, récapitulatif formateur J-7, évaluations J+1/J+4, alertes de l'échéancier à échéance ou en retard au responsable du jalon, synthèse qualité du lundi) ; conditions relues avant l'envoi (déjà fait → annulé, avec le motif) ; planification idempotente avec rattrapage limité ; messages externes « à valider » d'abord, internes envoyés directement ; journal complet (destinataire, modèle et version, empreinte, statut, identifiant d'envoi, tentatives, erreur) ; SMTP (Mailpit en local), adresses accentuées comprises ; modèles e-mail Jinja compatibles clients mail |
| Questionnaires — `application/service/questionnaires/` + `config/questionnaires/` | Questionnaires en ligne, lien personnel signé, sans compte : analyse du besoin et positionnement (J-15/J-10/J-7), satisfaction à chaud (fin, J+2, J+5), à froid (J+45, J+52), entreprise (J+60, J+67). La réponse devient la donnée réelle (analyse du besoin, positionnement, appréciation) sans jamais écraser une saisie, avec les événements habituels pour le moteur Qualiopi ; la relance s'annule dès la réponse. Convocation et attestation transmises par lien signé, fichier vérifié contre son empreinte |
| RH — `handler/hr.py`, `types/hr.py` | Ressources humaines (module activable) : personnel distinct des comptes, contrats, absences (nature seulement), titres des formateurs typés (carte formateur CNAPS, SSIAP 3, formateur SST…) et leurs échéances ; disponibilité et contrat vérifiés à la confirmation d'une session ; un compte relié à une fiche formateur ne voit que ses sessions |
| Socle de configuration — `application/service/platform/`, `handler/platform.py` | Socle de configuration : fonctionnalités activables (une fonctionnalité inactive retire ses droits), réglages typés déclarés par chaque domaine, datés et journalisés (`ConfigurationService`), décisions motivées (`Decision`), `GET /api/v1/bootstrap` pour le futur front |
| Revue — `application/service/qualiopi/review/` | Revue humaine attestée par indicateur (conclusion, justification, validité) |
| Cycle — `application/service/qualiopi/cycle/` | Cycle de certification : période évaluée pour l'état global et l'échantillon d'audit |
| EDOF — `application/service/edof/` + `config/edof/` | Fiche formation unique (certification, habilitations, intervenants, contenus) validée en versions figées ; programme rédigé et aperçu public tirés d'une version. Référencement CPF : dossier de l'établissement et dossier par formation, pièces du référentiel EDOF relu le 02/10/2026 (conditions, ancienneté, SIRET, pièces sensibles, pièce commune jamais copiée), contrôles avec niveau et cible, cycle déclaratif (dépôt, compléments, décision saisis par une personne), accompagnement CDC. Voir `docs/edof/` |
| Journal — `common/journal.py` | Journal des modifications métier : qui, quoi, quand, champ par champ |

## Démarrer en local

Prérequis : Python 3.11+, PostgreSQL 16.

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/gsms
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
alembic upgrade head
python -m app.cmd.cli create-admin admin@exemple.fr "Administrateur"   # mot de passe demandé
python -m app.cmd.cli seed-demo          # données d'exemple fictives, 15 trous et 8 jalons plantés
python -m app.cmd.cli retirer-demo       # les retire (les données importées ou saisies restent)
uvicorn app.cmd.server:app --reload        # API sur :8000, documentation sur /docs
python -m app.cmd.worker                 # dans un second terminal
```

Back-office et landing : `./scripts/dev.sh` (http://localhost:4150). Documentation de l'API : http://localhost:8000/docs.

Dossier d'audit d'une session (avec son échéancier) : `GET /api/v1/sessions/{id}/dossier`.
État de préparation global sur le cycle en cours : `GET /api/v1/qualiopi/readiness`.
Échéances proches ou dépassées : `GET /api/v1/qualiopi/echeances`.
Chaîne d'un indicateur (critère, exigences, preuves attendues, contrôles, preuves, écarts, actions, historique) :
`GET /api/v1/qualiopi/indicateurs/{n}` ; vue par critère : `GET /api/v1/qualiopi/criteres`.
Actions correctives : `POST /api/v1/qualiopi/ecarts/{id}/actions`, puis
`POST /api/v1/qualiopi/actions/{id}/{demarrer|realiser|verifier|annuler}` ; liste : `GET /api/v1/qualiopi/actions?en_retard=true`.
Relances (module « relances » à activer) : le worker planifie et envoie toutes les 15 minutes ;
`GET /api/v1/communications`, `POST /api/v1/communications/{id}/valider|annuler|renvoyer`,
aperçu exact : `GET /api/v1/communications/{id}/apercu`.
Public (lien signé, sans compte) : `GET|POST /api/v1/public/questionnaires/{jeton}`, `GET /api/v1/public/documents/{jeton}` ;
les pages publiques du front (`/q/{jeton}`, `/espace/{jeton}`) sont à refaire avec le nouveau front (`PUBLIC_URL` = adresse du front, utilisée dans les liens des e-mails). En local, Mailpit reçoit tout sur http://localhost:8025.
Une action issue d'un contrôle n'est jamais close par un humain : « vérifier » demande au moteur de réévaluer,
et il ne clôt que si l'écart a disparu.

## Docker

```bash
cp .env.example .env    # renseigner POSTGRES_PASSWORD et JWT_SECRET (obligatoires)
docker compose up -d --build
docker compose exec api python -m app.cmd.cli create-admin admin@exemple.fr "Administrateur"
docker compose exec api python -m app.cmd.cli seed-demo
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
