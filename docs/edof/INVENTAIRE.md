# Inventaire des deux dépôts pour le parcours EDOF de Form'SSI

Relevé du 02/10/2026 sur `gsms-qualiopi` (branche `main`, commit `dd62cf5`) et `gsms-school-aps`
(commit `d7e0501`). Chaque élément est classé : **opérationnel** (code utilisé et testé), **données
réelles**, **démonstration**, **incomplet**.

## 1. gsms-qualiopi

| Élément | État | Ce qu'on en tire pour EDOF |
|---|---|---|
| `formation.program` : intitulé, objectifs, prérequis, durée, tarif, méthodes, évaluation, délai, accessibilité, code RNCP | Opérationnel (CRUD `/programs`, page Programmes) | Base de la fiche formation unique ; complétée (public, compétences, modalité, modules, moyens) |
| `formation.trainer` + `trainer_qualification` (carte CNAPS, SSIAP 3, formateur SST…, dates de validité) | Opérationnel | Intervenants de la formation et contrôle « Justificatif expiré » sur leurs titres |
| `formation.document` : versions, SHA-256, statut `REMPLACE`, stockage adressé par empreinte | Opérationnel | Stockage des pièces EDOF sans écrasement ; une pièce commune est un seul document rattaché à plusieurs dossiers |
| Dossiers de pièces `ORGANISME` / `FORMATEUR` (`config/dossiers/standard.yaml`, grilles, demandes) | Opérationnel | Modèle repris pour `config/edof/referencement.yaml` ; un CV de formateur déjà déposé peut être rattaché au dossier EDOF |
| Moteur Qualiopi (preuves, contrôles, écarts, actions correctives) | Opérationnel, borné : ne prononce jamais la conformité | Non réutilisé pour EDOF (les pièces EDOF ne sont pas des preuves Qualiopi) ; ses événements EDOF sont ignorés pour ne pas le relancer à tort |
| Financement CPF (`config/financement/dispositifs.yaml`) : demande, entrée, sortie, service fait sur EDOF | Opérationnel, module désactivé par défaut | Suit les dossiers **stagiaires** après référencement ; distinct du référencement de l'organisme |
| Émargement, évaluations, attestations | Opérationnel | Suivi pédagogique de la formation (présences émargées, évaluations, attestations) |
| Rendu Jinja figé + SHA-256 (convocation, attestation) | Opérationnel | Même principe pour le programme rédigé depuis une version validée |
| `Decision` / `PolicyDenied`, `ActionGate`, permissions, fonctionnalités | Opérationnel | Cycle du dossier gouverné par l'API ; nouvelles permissions `edof.*`, `programs.validate`, fonctionnalité `edof` |
| Organisme : `Organization` (nom, SIRET, NDA, catégories) | Données de **démonstration** seulement (`seed-demo`) | Complété par le profil `edof.establishment` ; données réelles importées par `import-formssi` |
| Front : pages Programmes, Formateurs, Qualifications, Sessions | Opérationnel (Metronic CRM) | Repris tels quels ; nouvelles pages `/formation/edof` |
| Tests Playwright du front | **Absents de `main`** (scripts `typecheck` et `test:e2e` cités dans CLAUDE.md, mais supprimés lors du passage à Metronic) | Vérification faite par script Playwright hors dépôt (voir HANDOFF) |
| ESLint | **Cassé sur `main`** : la surcharge `ajv >=8.18` et `minimatch ^10` de `package.json` est incompatible avec `@eslint/eslintrc` | Contournement local seulement ; à corriger dans `package.json` |
| Vitrine publique de Form'SSI | **N'existe pas** | L'aperçu public est présenté comme un aperçu, rien n'est publié |

## 2. gsms-school-aps

| Élément | État | Usage retenu |
|---|---|---|
| Catalogue de 32 formations (`formations-catalog.snapshot.json`, `formation-vitrine-catalog.ts`) : TFP APS, MAC APS, SSIAP 1-2-3, SST, habilitations électriques… | **Données réelles** (intitulés, durées annoncées, modules résumés), sans tarif ni code RNCP | Source de la première formation (TFP APS) ; import des 31 autres à faire |
| Programme TFP APS UV1 à UV14 (`formations-tfp-program.json`) | **Données réelles** | Repris tel quel comme modules (`config/edof/formssi-tfp-aps-modules.json`) |
| Fiches vitrine (`i18n/landing-content/sheet-content/*.ts`) : prérequis, présentation, badge « Éligible CPF » | Données réelles **à relire** : durée 140–175 h contre 175 h, badge CPF sans fondement enregistré, « Carte pro APS » présentée comme la certification | Prérequis et public repris ; incohérences rendues visibles comme « points à arbitrer » |
| Identité Form'SSI (seed `cnaps-candidat-profile-seed.js`) : « FORM'SSI SARL », SIRET, n° d'autorisation CNAPS `FOP-092-…` | Données d'amorçage, probablement réelles | SIRET confirmé par l'Annuaire des entreprises ; autorisation CNAPS reprise **à vérifier** |
| LMS : `Course` / `Chapter` / `Activity`, quiz, `UserProgress`, `QuizAttempt` | Opérationnel côté code ; **contenus générés automatiquement** (`portal-lms-seed.js` : texte générique, 2 questions génériques par UV) | Déclarés comme contenus « à rédiger » ; aucune progression LMS présentée comme preuve |
| Dossiers de conformité candidats (CNAPS, admission) | Opérationnel | Hors périmètre (dossier du stagiaire, pas de l'organisme) |
| Pièces administratives de l'école (`admin-document-slots.ts` : Kbis, Qualiopi, NDA, assurances…) | Opérationnel, sans contrôle de validité | Liste confrontée aux pièces EDOF ; la version GSMS Qualiopi ajoute dates, SIRET, validation |
| Sessions, examens (jury, examinateur), attestations | Opérationnel, données de démonstration | Pas repris : GSMS Qualiopi a ses propres sessions |

## 3. Ce qui a été fait de cet inventaire

- **Réutilisé directement** : documents versionnés et stockage, formateurs et titres, émargement et
  évaluations, décisions motivées, permissions, rendu Jinja figé, CRUD des programmes.
- **Adapté** : la fiche formation (nouveaux champs), le dossier de pièces (nouveau référentiel EDOF avec
  conditions, ancienneté, SIRET, sensibilité, partage), la vue de suivi pédagogique.
- **Développé** : certification et habilitations, intervenants et contenus de la formation, versions
  validées, programme rédigé, aperçu public, dossiers EDOF (établissement, formation), contrôles,
  cycle déclaratif, compléments CDC, accompagnement CDC, import Form'SSI, écrans du parcours.
- **Non repris** : le LMS de GSMS School (pas de lien technique entre les deux bases) ; les contenus
  générés automatiquement sont listés comme « à rédiger ».
