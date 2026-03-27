# Web Forx Time Tracker Agent Handbook

Last updated: 2026-03-26 (America/Chicago)

This document is the single operational reference for any coding agent working in this repository.

## 1. What This App Is

Web Forx Time Tracker is an internal time-tracking platform with three runtime surfaces:

- Web frontend (`frontend/`): React + Vite UI for employees, managers, and admins.
- Backend API (`backend/`): Express + Prisma + PostgreSQL for auth, timers, reports, integrations, and admin operations.
- Desktop wrapper (`desktop/`): Electron app for desktop usage and native bridge capabilities.

Primary business purpose:

- Track work time by project and task.
- Give managers/admins visibility into approvals, reports, and team utilization.
- Support integration workflows (Google Calendar, Taiga, Mattermost).

## 2. Source Of Truth Files

Agents should treat these as authoritative in this order:

1. `AGENT_HANDBOOK.md` (this file)
2. `docs/mvp.md`
3. `docs/app-route.md`
4. `DEPLOYMENT.md`
5. `README.md`
6. `docs/seo.md`
7. Design assets:
- `desktop-designs/`
- `mobile-designs/`
- `stitch_extracted/`

If implementation and docs disagree, reconcile to `docs/mvp.md` and `docs/app-route.md` unless a newer deployment-critical correction is documented in this handbook.

## 3. Repository Map

- `frontend/` React app, route guards, pages, API client.
- `backend/` Express API, Prisma schema, seed logic, cron endpoints, workers.
- `desktop/` Electron wrapper.
- `docs/` Product and route specifications.

Key backend folders:

- `backend/src/controllers/`
- `backend/src/routes/`
- `backend/src/middlewares/`
- `backend/src/services/`
- `backend/src/workers/`
- `backend/prisma/`

Key frontend folders:

- `frontend/src/pages/`
- `frontend/src/components/`
- `frontend/src/services/api.ts`
- `frontend/src/utils/session.ts`

## 4. Architecture Summary

Request flow:

1. User authenticates via frontend `/login`.
2. Frontend calls `POST /api/v1/auth/login`.
3. Backend returns JWT + role.
4. Frontend stores token in localStorage and sends `Authorization: Bearer <token>` for protected calls.
5. Backend enforces role-based access via middleware.

Data persistence:

- PostgreSQL via Prisma.
- Timers stored in `ActiveTimer` for refresh-safe active sessions.
- Completed records stored in `TimeEntry`.
- Integrations stored encrypted in `Integration.config`.

Background workloads:

- Notification worker.
- Idle tracker.
- Burnout tracker.
- Cron routes protected by `CRON_SECRET` in production.

## 5. Runtime And Version Constraints

- Node.js: `>=20.19.0 <21 || >=22.12.0`
- Backend package manager: npm
- Frontend package manager: npm
- Database: PostgreSQL
- ORM: Prisma
- Host/deploy: Vercel (frontend + backend), Neon PostgreSQL

## 6. Current Production Topology (As Of 2026-03-26)

Vercel projects:

- Frontend project: `vercel`
- Backend project: `vercel-backend`

Current production URLs:

- Frontend (canonical alias): `https://timer.dev.webforxtech.com`
- Frontend alias: `https://vercel-self-five-79.vercel.app`
- Frontend alias: `https://vercel-alozeus-projects.vercel.app`
- Frontend alias: `https://vercel-alozeus1-alozeus-projects.vercel.app`
- Backend (canonical alias): `https://vercel-backend-xi-three.vercel.app`
- Backend API base: `https://vercel-backend-xi-three.vercel.app/api/v1`

Google OAuth callback (production):

- `https://vercel-backend-xi-three.vercel.app/api/v1/calendar/callback`

## 7. Environment Variables

### Backend required in all environments

- `DATABASE_URL`
- `JWT_SECRET`

### Backend required in production

- `INTEGRATION_SECRET` (no fallback allowed in production)
- `CRON_SECRET`
- `CORS_ORIGIN`
- `FRONTEND_URL`
- `NODE_ENV=production`
- `ENABLE_BACKGROUND_WORKERS`

### Backend optional/feature-gated

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SEED_ADMIN_PASSWORD`
- `SEED_MANAGER_PASSWORD`
- `SEED_EMPLOYEE_PASSWORD`
- `ALLOW_DEFAULT_SEED_CREDENTIALS` (non-production only)

### Frontend required in production

- `VITE_API_URL` (must include `/api/v1`)

Current production behavior notes:

- CORS supports multiple origins using comma-separated values in `CORS_ORIGIN` and `FRONTEND_URL` parsing logic.
- Frontend API target is baked at build time from `VITE_API_URL`.

## 8. Auth, Roles, And Route Guards

Frontend protected routes are implemented in `frontend/src/App.tsx`.

Role constraints:

- Employee: core user routes only.
- Manager: includes `/team`, approvals, broader reports.
- Admin: includes `/admin`, user/project management, integration config write access.

Backend role middleware is in `backend/src/middlewares/auth.ts` and applied per route.

## 9. Implemented Route Surface

Frontend routes:

- `/login`
- `/dashboard`
- `/timer`
- `/timeline`
- `/timesheet`
- `/reports`
- `/team` (Manager/Admin)
- `/admin` (Admin)
- `/settings`
- `/profile`
- `/integrations`
- `/integrations/taiga`
- `/integrations/mattermost`

Backend route groups (`/api/v1`):

- `/auth`
- `/users`
- `/projects`
- `/timers`
- `/reports`
- `/integrations`
- `/calendar`
- `/ml`
- `/admin`
- `/cron`
- `/health`

See exact mapping in `docs/app-route.md` and `backend/src/routes/*.ts`.

## 10. Core Data Model

Primary Prisma models:

- `User`, `Role`
- `Project`, `ProjectMember`
- `TimeEntry`, `ActiveTimer`
- `Notification`, `AuditLog`
- `Integration`
- `CalendarConnection`
- `ReportCache`

Initial seeded projects:

- EDUSUC
- LAFABAH
- Yemba
- Platform Engineering
- BA
- Webforx Website
- Web Forx Technology

Seeded users:

- `admin@webforxtech.com`
- `manager@webforxtech.com`
- `employee@webforxtech.com`

Password policy in seed logic:

- Uses `SEED_*` values when present.
- Uses defaults only when `ALLOW_DEFAULT_SEED_CREDENTIALS=true` and non-production.
- Otherwise generates random values.

## 11. Local Development Workflow

### Start backend

```bash
cd backend
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

### Start frontend

```bash
cd frontend
npm install
npm run dev
```

### Start desktop wrapper

```bash
cd desktop
npm install
npm start
```

## 12. Deployment Strategy (Recommended Order)

For safe production rollout:

1. Update backend env vars first.
2. Deploy backend (`vercel deploy --prod`).
3. Run DB migration/seed tasks.
- Preferred with migrations: `npx prisma migrate deploy`
- If migration history is not established yet, use controlled `npx prisma db push` policy.
4. Verify backend health (`/api/v1/health`) and critical auth flows.
5. Update frontend `VITE_API_URL` if backend URL changed.
6. Deploy frontend.
7. Run smoke checks on login, timer start/stop, reports, integrations status.

Rollback strategy:

- Backend: promote prior successful Vercel deployment to production alias.
- Frontend: promote prior deployment if a bad frontend build ships wrong API config.
- Database: restore from Neon backup/branch snapshot.

## 13. Disaster Recovery (DR) And Continuity

### Current foundation

- App tiers are deployable independently (frontend/backend).
- Backend stateless on Vercel.
- Primary state in PostgreSQL (Neon).

### Recommended DR policy

- RPO target: <= 24 hours.
- RTO target: <= 60 minutes.
- Keep daily database backup policy enabled in Neon.
- Before high-risk releases, create a Neon branch or snapshot.
- Keep a tested restore runbook and a known-good deployment pair (frontend + backend).

### DR runbook (high level)

1. Declare incident and freeze deployments.
2. Verify whether failure is app tier, config tier, or database tier.
3. If app tier regression: rollback Vercel deployment alias.
4. If database corruption: restore Neon point-in-time/backup to recovery branch.
5. Update `DATABASE_URL` to recovered DB branch.
6. Redeploy backend.
7. Run smoke checks: auth, timer lifecycle, reports export, integrations status.
8. Document incident and prevention actions.

## 14. Troubleshooting Runbook

### Login fails with correct credentials

Checks:

1. Verify backend auth directly:
```bash
curl -i -X POST https://vercel-backend-xi-three.vercel.app/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@webforxtech.com","password":"<password>"}'
```
2. Verify frontend built API URL from bundle or env.
3. Verify CORS preflight returns matching `access-control-allow-origin`.
4. Confirm `CORS_ORIGIN` contains the active frontend domain(s).

### Google Calendar cannot connect

Checks:

1. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` exist in backend production env.
2. Google Cloud Console authorized redirect URI exactly matches production callback URL.
3. Frontend can reach backend `/calendar/connect` and `/calendar/status`.

### Timer state lost after refresh

Checks:

1. Confirm `/timers/start` and `/timers/me` responses include active timer.
2. Verify backend DB connectivity.
3. Verify auth token is present and not removed by 401 interceptor.

### Cron endpoints return unauthorized

Checks:

1. Ensure `CRON_SECRET` is set in production.
2. Verify caller sends `Authorization: Bearer <CRON_SECRET>`.

### Frontend build works locally but prod behaves differently

Checks:

1. Confirm `VITE_API_URL` in Vercel frontend production env.
2. Redeploy frontend after env update (Vite vars are build-time).

## 15. Quality Gates Before Merge Or Deploy

Minimum:

- Backend builds: `cd backend && npm run build`
- Frontend builds: `cd frontend && npm run build`
- Frontend lint: `cd frontend && npm run lint`

Recommended behavior tests:

- Frontend unit: `cd frontend && npm run test:unit`
- Frontend e2e: `cd frontend && npm run test:e2e`
- Backend tests: `cd backend && npm test`

## 16. Known Operational Nuances

- Backend CORS now supports multi-origin list, not a single hard-coded origin.
- `INTEGRATION_SECRET` fallback to `JWT_SECRET` is blocked in production.
- Seed credentials in production should be controlled explicitly via `SEED_*` variables.
- Frontend route restrictions are role-based and can hide pages even when API works.

## 17. Agent Startup Checklist

When any agent starts work, do this first:

1. Read this file completely.
2. Read `docs/mvp.md` and `docs/app-route.md`.
3. Confirm whether task targets frontend, backend, desktop, or docs.
4. Confirm env assumptions (local vs production).
5. If deployment-impacting, verify current Vercel URLs and env key presence before changing code.
6. Execute the smallest safe change and run build checks.
7. Update this handbook if deployment topology or core behavior changed.

