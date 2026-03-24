Antigravity must treat the following repository files as the source of truth:

1. [docs/mvp.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/mvp.md)
2. [docs/seo.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/seo.md)
3. [docs/app-route.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/app-route.md)
4. Stitch UI design packages in [desktop-designs](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/desktop-designs), [mobile-designs](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/mobile-designs), and [stitch_extracted](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/stitch_extracted)

Implementation rules:

1. Design must follow the Stitch layouts unless the source-of-truth docs explicitly override them.
2. Backend behavior must implement the functionality defined in [docs/mvp.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/mvp.md).
3. Routes must match [docs/app-route.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/app-route.md).
4. Live-test deployments must not rely on fallback secrets, hardcoded API ports, or undocumented environment variables.

Production-readiness gate:

1. `backend/.env` must provide `DATABASE_URL`, `JWT_SECRET`, and `PORT`. `INTEGRATION_SECRET` is strongly recommended and falls back to `JWT_SECRET` only for compatibility.
2. `frontend/.env` must provide `VITE_API_URL` when the API is not running on `http://localhost:5005/api/v1`.
3. `npm run build` must pass in both [backend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/backend) and [frontend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/frontend).
4. `npm run lint` must pass in [frontend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/frontend).
5. Seed data must include the initial projects and at least one admin, manager, and employee for live testing.
6. Real Google Calendar sync requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `backend/.env`.
