# GSMS Qualiopi

Application d'un organisme de formation : backend Python (domaine formation + moteur de préparation
Qualiopi) et front Next.js (espace formation).
Le moteur transforme les données du quotidien (inscriptions, positionnements, émargements,
évaluations…) en preuves traçables, les confronte au référentiel national qualité (V9, puis V10 au
1er novembre 2026) et explique
chaque écart. Il ne prononce jamais de conformité : seul l'organisme certificateur en décide.

**Statut : jalons 1 et 1 bis terminés, jalon 2 en cours** — backend : socle de configuration, Formation,
Émargement, RH, Financement, Parcours du stagiaire, chaîne Qualiopi, actions correctives, relances, questionnaires en ligne, fiche formation versionnée et référencement EDOF (182 tests). Front : premier parcours complet
(connexion, sessions, détail, parcours des stagiaires, émargement, Qualiopi de la session), testé par
Playwright sur ordinateur et mobile. Voir [`frontend/README.md`](frontend/README.md).

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
| `app/funding/` + `config/financement/` | Financement (modules activables par dispositif) : dossier par inscription, sources multiples (cofinancement au statut calculé, sur-financement bloqué), cinq rôles séparés (bénéficiaire, financeur, signataire, destinataire de facture, payeur) ; circuits CPF, OPCO, France Travail (AIF), entreprise et reste à charge décrits en YAML versionné, conditions nommées lues dans les données existantes, échéances en jours ouvrés (fériés compris), actions de portail tracées, taux de réalisation depuis l'émargement, règles datées sourcées (participation CPF 100 € puis 150 €) |
| `app/journey/` + `config/documents_generes/` | Parcours du stagiaire : analyse du besoin, positionnement, convention ou contrat (envoi, signature), convocation, évaluations, fin, abandon ou annulation, attestation, satisfaction à chaud et à froid ; chaque étape a sa politique (permission, portée du formateur, état, conditions) et ses refus motivés ; le moteur **rédige** la convocation (horaires tirés des demi-journées, accessibilité) et l'attestation de fin (objectifs, nature L. 6313-1, durée suivie tirée de l'émargement, résultats des évaluations, L. 6353-1), figées par empreinte SHA-256 et versionnées |
| `app/relances/` + `config/relances/` + `config/emails/` | Relances et communications (module activable) : calendrier en YAML (convention à signer J-15/J-10/J-7, rappel J-2, récapitulatif formateur J-7, évaluations J+1/J+4, alertes de l'échéancier à échéance ou en retard au responsable du jalon, synthèse qualité du lundi) ; conditions relues avant l'envoi (déjà fait → annulé, avec le motif) ; planification idempotente avec rattrapage limité ; messages externes « à valider » d'abord, internes envoyés directement ; journal complet (destinataire, modèle et version, empreinte, statut, identifiant d'envoi, tentatives, erreur) ; SMTP (Mailpit en local), adresses accentuées comprises ; modèles e-mail Jinja compatibles clients mail |
| `app/questionnaires/` + `config/questionnaires/` | Questionnaires en ligne, lien personnel signé, sans compte : analyse du besoin et positionnement (J-15/J-10/J-7), satisfaction à chaud (fin, J+2, J+5), à froid (J+45, J+52), entreprise (J+60, J+67). La réponse devient la donnée réelle (analyse du besoin, positionnement, appréciation) sans jamais écraser une saisie, avec les événements habituels pour le moteur Qualiopi ; la relance s'annule dès la réponse. Convocation et attestation transmises par lien signé, fichier vérifié contre son empreinte |
| `frontend/` | Espace formation (Next.js 16) : identité de l'organisme par tokens, navigation issue de `/bootstrap`, sessions, parcours des stagiaires (matrice d'états datés, panneau, formulaires, documents émis), émargement, Qualiopi de la session ; boutons gouvernés par les décisions du moteur ; tests Playwright ordinateur + mobile avec axe-core et captures |
| `app/hr/` | Ressources humaines (module activable) : personnel distinct des comptes, contrats, absences (nature seulement), titres des formateurs typés (carte formateur CNAPS, SSIAP 3, formateur SST…) et leurs échéances ; disponibilité et contrat vérifiés à la confirmation d'une session ; un compte relié à une fiche formateur ne voit que ses sessions |
| `app/platform/` | Socle de configuration : fonctionnalités activables (une fonctionnalité inactive retire ses droits), réglages typés déclarés par chaque domaine, datés et journalisés (`ConfigurationService`), décisions motivées (`Decision`), `GET /api/v1/bootstrap` pour le front |
| `app/qualiopi/review/` | Revue humaine attestée par indicateur (conclusion, justification, validité) |
| `app/qualiopi/cycle/` | Cycle de certification : période évaluée pour l'état global et l'échantillon d'audit |
| `app/edof/` + `config/edof/` | Fiche formation unique (certification, habilitations, intervenants, contenus) validée en versions figées ; programme rédigé et aperçu public tirés d'une version. Référencement CPF : dossier de l'établissement et dossier par formation, pièces du référentiel EDOF relu le 02/10/2026 (conditions, ancienneté, SIRET, pièces sensibles, pièce commune jamais copiée), contrôles avec niveau et cible, cycle déclaratif (dépôt, compléments, décision saisis par une personne), accompagnement CDC. Voir `docs/edof/` |
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

Front (second terminal) : `cd frontend && npm install && GSMS_API_URL=http://127.0.0.1:8000 npm run dev`
puis http://localhost:3000.

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
côté front, la page `/q/{jeton}` et le relais `/api/public/…` (`PUBLIC_URL` = adresse du front). En local, Mailpit reçoit tout sur http://localhost:8025.
Une action issue d'un contrôle n'est jamais close par un humain : « vérifier » demande au moteur de réévaluer,
et il ne clôt que si l'écart a disparu.

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
