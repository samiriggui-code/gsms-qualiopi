# GSMS Qualiopi — consignes pour Claude

Lire `HANDOFF.md` en premier : contexte, règles non négociables, état du projet, prochaines étapes.

Rappels essentiels :
- ce dépôt est public : aucun fichier Metronic (sous licence) ni secret ne doit y être commité ; la démo
  Metronic se consulte dans `research/` (ignoré par git) ;
- ne jamais transformer une bonne pratique en obligation réglementaire ; ne jamais montrer une fonction
  qui n'existe pas ;
- le front affiche les décisions de l'API, il ne recode aucune règle métier (`frontend/AGENTS.md` :
  Next.js 16, lire sa documentation locale) ;
- avant tout commit : `ruff check . && python -m pytest && alembic check` (backend),
  `npm run typecheck && npm run lint && npm run format:check && npm run test:e2e` (front).
