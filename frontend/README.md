# GSMS Qualiopi — front (espace formation)

Next.js 16 (App Router), TypeScript, Tailwind 4, primitives Radix, TanStack Query. Le front ne recode
**aucune règle métier** : il affiche ce que l'API décide (capacités, refus motivés, état des étapes).

## Démarrer

```bash
cd frontend
npm install
GSMS_API_URL=http://127.0.0.1:8000 npm run dev   # http://localhost:3000
```

L'API GSMS doit tourner (voir le README racine). Le navigateur ne parle jamais directement à l'API :
`/api/auth/login` pose le jeton dans un cookie `httpOnly`, `/api/gsms/*` relaie les appels avec ce jeton.

## Organisation

| Dossier | Rôle |
|---|---|
| `src/app/globals.css` | Fondation : tokens (couleurs, états, rayons, ombres), thèmes clair et sombre. `--brand` = couleur de l'organisme (réglage `general.brand_color`, posée au chargement). |
| `src/components/ui/` | Composants génériques (bouton, badge, champs, panneau latéral, fenêtre, onglets, info-bulle). |
| `src/components/app/` | Coquille (navigation issue de `/bootstrap`), états vide / erreur / chargement, **ActionGate** (bouton gouverné par une décision du moteur). |
| `src/features/sessions/` | Liste des sessions, détail, onglets Parcours, Émargement, Qualiopi. |
| `src/features/journey/` | Parcours du stagiaire : marque d'état d'étape, panneau, formulaires des étapes. |
| `src/lib/` | Client d'API (erreurs lisibles), types des réponses, vocabulaire métier affiché. |
| `e2e/` | Tests Playwright sur la vraie API et une base de démo neuve. |

Principes :

- une action impossible dans l'état ou hors des droits est masquée ; une action bloquée pour une raison
  métier reste visible, sa raison est écrite (et redite au clic, car il n'y a pas de survol sur mobile) ;
- l'état d'une étape (fait, à venir, à échéance, en retard, sans objet) vient de l'API, avec les échéances
  de l'échéancier Qualiopi ;
- chaque couleur d'état a un sens fixe et une forme distincte (lisible sans la couleur).

## Vérifier

```bash
npm run typecheck && npm run lint && npm run format:check && npm run build
npm run test:e2e        # PostgreSQL local + dépendances Python du backend requis
```

`test:e2e` recrée une base de démo (`e2e/seed_e2e.py`), démarre l'API (port 8100) et le front (port 3100),
puis teste sur ordinateur (1440 px) et mobile (390 px) :

- connexion, liste, filtres, recherche, état vide ;
- détail de session et ses trois onglets ;
- saisie d'une étape (validation, enregistrement, relecture) ;
- refus motivés du moteur ;
- émission d'une attestation (document figé, empreinte SHA-256) ;
- portée de la formatrice (ses sessions, sans Qualiopi ni convocation) ;
- clavier (ouverture, fermeture, retour du focus) ;
- accessibilité axe-core (aucune violation grave) ;
- absence de débordement horizontal.

Les captures sont rangées dans `e2e-results/captures/` et jointes au rapport `e2e-report/`.

Comptes de la base de démo e2e (mot de passe `GSMS_E2E_PASSWORD`, par défaut `demo-gsms-2026`) :
`direction@demo.fr`, `gestion@demo.fr`, `julie@demo.fr` (formatrice).
