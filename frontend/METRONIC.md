# Front GSMS Qualiopi et démo Metronic

Référence : démo Metronic Next.js complète, décompressée localement dans `research/nextjs`
(non versionnée). Concept de base du front : **CRM** (`components/layouts/crm` → `components/layout`).

## Règles

1. **La mise en page CRM ne se déforme pas.** Sur ordinateur (≥ 1024 px), en-tête, barre latérale, barre de
   titre de page (`ContentHeader`) et contenu (`Content`) sont ceux de la démo. Les seuls ajustements sont
   préfixés `max-lg:` (téléphone et tablette) ; différences voulues : en-tête langue / thème / avatar,
   menu GSMS.
2. **On adapte les contenus, pas les conteneurs.** Une page GSMS reprend la structure d'une page de la
   démo (sections, cartes, datatable, sheet, dialog) et y met les données réelles de l'API.
3. **Les composants UI sont ceux de la démo** (`components/ui`, identiques, traduits en français).
   Les dépendances de la démo sont déjà dans `package.json`.
4. Un composant d'un autre concept (store-inventory, todo, mail, calendar) est importé **au moment où une
   page s'en sert**, dans `components/`, avec ses imports adaptés ; pas de copie en bloc.

## Correspondance démo → GSMS

| Démo | Motif | Pages GSMS |
|---|---|---|
| `crm/company` | fiche : onglets (vue d'ensemble, activité, notes, tâches, fichiers) + panneau de détails | fiche session, fiche indicateur, fiche entreprise, fiche formateur |
| `crm/companies`, `crm/contacts` | datatable complète (recherche, filtres à facettes, colonnes, pagination) | toutes les listes (déjà en place) |
| `store-inventory/order-list` | liste avec onglets comptés par statut, export, actions groupées | sessions (par statut), inscriptions, réclamations |
| `store-inventory/all-stock` | bandeau de synthèse : valeur + barre segmentée | préparation Qualiopi (démontrable / à risque / insuffisant) |
| `store-inventory/*-details-sheet` | grand panneau latéral : métriques, analyses, listes | fiche stagiaire (parcours, assiduité, évaluations, documents) |
| `store-inventory/product-form-sheet` | formulaire en sections, dépôt de fichier | programme, session, dépôt de pièces |
| `store-inventory/dashboard`, `crm/dashboard` | cartes indicateurs, graphiques | tableau de bord |
| `store-inventory/stock-planner` | tableau de planification avec échéances | échéancier Qualiopi |
| `todo/today`, `upcoming`, `priority` | anneaux de progression, listes groupées par échéance | échéances et alertes, actions correctives |
| `mail/inbox` | trois volets : dossiers, liste, lecture | communications (à valider, envoyées, échecs, aperçu) |
| `calendar` | agenda mois / semaine / jour | agenda des sessions et des demi-journées |
| `store-inventory/settings-modal` | réglages en onglets | organisme, réglages, fonctionnalités |

## Téléphone

La démo n'est pas prévue pour le téléphone sur ses pages fiches (panneau fixe de 500 px, zones de
défilement à hauteur fixe). En dessous de 1024 px : colonnes empilées, défilement de page, panneaux latéraux
en pleine largeur, datatables défilant dans leur carte.
