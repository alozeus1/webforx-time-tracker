# Antigravity Instructions

Antigravity must load `AGENT_HANDBOOK.md` first.

Read in this order:

1. `AGENT_HANDBOOK.md`
2. `docs/mvp.md`
3. `docs/seo.md`
4. `docs/app-route.md`
5. Stitch UI packages in `desktop-designs/`, `mobile-designs/`, and `stitch_extracted/`

Implementation rules:

1. Design must follow Stitch layouts unless source-of-truth docs explicitly override them.
2. Backend behavior must implement functionality defined in `docs/mvp.md`.
3. Routes must match `docs/app-route.md`.
4. Live-test and production deployments must not rely on fallback secrets, hardcoded API ports, or undocumented environment variables.
5. Use the deployment, DR, and troubleshooting runbooks in `AGENT_HANDBOOK.md` as the operational source for release and incident handling.

Production-readiness gate:

1. Backend production env must include: `DATABASE_URL`, `JWT_SECRET`, `INTEGRATION_SECRET`, `CRON_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL`, and `NODE_ENV`.
2. Frontend production env must include `VITE_API_URL`.
3. Build must pass in both `backend/` and `frontend/`.
4. Lint must pass in `frontend/`.
5. Seed data must include the initial projects and at least one admin, manager, and employee for live testing.
6. Real Google Calendar sync requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in backend production env.
