# Handoff — GSMS Qualiopi (29/09/2026)

## Statut
Gel levé. Front créé dans `frontend/` à partir du concept CRM de Metronic (d'abord la démo 4, abandonnée car elle laissait trop peu de place aux pages), aux couleurs FORM'SSI. Catalogue de démos Metronic sous `/demo` (dev uniquement, à supprimer avant prod). Connexion fonctionnelle de bout en bout (front → API → PostgreSQL). Rien n'est encore commité depuis `dd54754`.

## Fait dans cette session
- `frontend/` : bibliothèque et layout du concept CRM de Metronic (éléments de démo retirés), navigation Qualiopi (`config/menu.config.ts`), pages provisoires via `app/(app)/[...slug]`, catalogue `/demo` hors menu. Sauvegarde de l'ancienne version (démo 4) : `frontend-avant-crm.tar` dans le scratchpad de la session du 29/09.
- Auth : pages Metronic NextAuth/Prisma retirées (inscription, reset, vérification email, changement de mot de passe : aucune API derrière). Connexion branchée sur FastAPI, JWT en cookie httpOnly, proxy `/api/backend/*`, garde `proxy.ts`.
- Branding : icône FORM'SSI (favicon, rail), logos sur la page de connexion, fond `couv-dark.jpg`. Attention, les noms sont inversés par rapport à l'usage : `formssi-logo-light.png` = texte foncé (fond clair), `formssi-logo-full.png` = texte blanc (fond sombre).
- Backend : `app/main.py` créé (CORS, handlers d'erreurs, routeur auth, `/api/health`, création de l'admin si base vide).
- Bug corrigé : la migration initiale omettait `created_by` (TimestampMixin) sur 29 tables → migration `9a7fd06389a7_alignement_modeles`.
- Base locale `gsms_qualiopi` créée et migrée ; venv dans `backend/.venv`.
- `i18next` installé uniquement parce que `frontend/i18n/` (ajouté à la main, config Metronic sans français) l'importe ; ce dossier n'est utilisé nulle part.

## Écrans construits
- **Qualiopi › Indicateurs** (`app/(app)/qualiopi/referentiel/`) : liste (modèle Companies du CRM : recherche, filtres Critère/Périmètre, colonnes, pagination) et fiche indicateur (modèle Company : guide de lecture, contrôles, panneau de détails, navigation précédent/suivant). Données : `lib/qualiopi/referentiel.ts`. Composants réutilisables : `components/facet-filter.tsx`, `components/guide-text.tsx`.
- Libellés des tableaux Metronic (`components/ui/data-grid*`) traduits en français.

## Prochaines étapes
1. Brancher les routeurs métier restants dans `app/main.py` (preuves, évaluation, audit, CAPA, formation) — `auth` et référentiel sont faits.
2. Tests backend : import du référentiel v9, détecteurs de preuves, runner d'évaluation.
3. Écrans suivants : sessions / apprenants (données formation), puis preuves et évaluations rattachées aux indicateurs.
4. Décider du sort de `frontend/i18n/` (l'adapter au français ou le supprimer).
5. Commit du tout.
