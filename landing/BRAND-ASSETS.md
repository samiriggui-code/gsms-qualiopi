# Visuels de la landing

Le code de cette landing vient de Tencent/WeKnora (licence MIT, voir `../LICENSE`). Les visuels, eux, ne sont pas à nous :
à remplacer pour chaque projet décliné depuis ce template.

| Dossier | Contenu actuel | À faire |
|---|---|---|
| `public/brand/` | Logo WeKnora (marque de Tencent) | Remplacer par le logo du projet (`brand-logo.tsx`) |
| `public/brands/` | Logos d'intégrations (Notion, Slack, OpenAI, Claude…), propriété de leurs titulaires ; icônes Lobe Icons sous licence MIT | Garder seulement les intégrations réelles du projet (`brands.tsx`) |
| `public/product/` | Vide (captures WeKnora retirées) ; les galeries affichent un emplacement « Capture à compléter » | Déposer les captures du projet sous les noms attendus |
| `public/favicon.ico` | Icône WeKnora | Remplacer |

La vidéo de démonstration WeKnora est retirée de la page ; le composant `ProductVideo` (`app/interactive.tsx`) reste disponible pour une vidéo du projet.
