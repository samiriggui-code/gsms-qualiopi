# GSMS Qualiopi — consignes pour Claude

Lire `HANDOFF.md` en premier : contexte, règles non négociables, état du projet, prochaines étapes.

Rappels essentiels :
- ce dépôt est public ; aucun secret ne doit y être commité. Le front Metronic y est publié par décision
  du propriétaire (29/09/2026, voir HANDOFF §5 bis) ;
- ne jamais transformer une bonne pratique en obligation réglementaire ; ne jamais montrer une fonction
  qui n'existe pas ;
- le front affiche les décisions de l'API, il ne recode aucune règle métier (`frontend/AGENTS.md` :
  Next.js 16, lire sa documentation locale) ;
- avant tout commit : `ruff check . && python -m pytest && alembic check` (backend),
  `npm run typecheck && npm run lint && npm run format:check && npm run test:e2e` (front).
