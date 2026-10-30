# GSMS Qualiopi — consignes pour Claude

Lire `HANDOFF.md` en premier : contexte, règles non négociables, état du projet, prochaines étapes.

Rappels essentiels :
- ce dépôt est public ; aucun secret ne doit y être commité ;
- **structure standard Global-IT-SS** (comme `global-it-ss-template`) : `app/` back-office Vue 3 + TDesign
  (coque du template : menu, panneau Paramètres, connexion), `backend/` API FastAPI, `landing/`, `theme/`,
  `scripts/dev.sh`. L'ancien front Next/Metronic a été retiré le 26/10/2026. Routes et paramétrage :
  `docs/API.md` ;
- ne jamais transformer une bonne pratique en obligation réglementaire ; ne jamais montrer une fonction
  qui n'existe pas ;
- le futur front affichera les décisions de l'API, il ne recodera aucune règle métier ;
- avant tout commit : `ruff check . && python -m pytest && alembic check` (backend), build + tests de `app/`.

## AI Operating System Design

When the task concerns agent architecture, orchestration, workflow design,
handoffs, memory, QA, approvals, or multi-agent execution, use the local skill:

`.claude/skills/ai-operating-system/SKILL.md`

Do not apply this framework to normal bug fixes, frontend changes, migrations,
small refactors, tests, or routine implementation tasks unless explicitly relevant.
