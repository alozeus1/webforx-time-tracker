# Web Forx Time Tracker Agent Handbook

Last updated: 2026-07-17 (America/Chicago)

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

Cookie-authenticated mutations use a signed double-submit CSRF token. The SPA
obtains it from login/MFA/Google responses or `GET /api/v1/auth/csrf-token` and
sends it as `X-CSRF-Token`. Bearer-authenticated API mutations are exempt because
the browser does not attach bearer credentials implicitly.

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

## 6. Current Production Topology (As Of 2026-07-17)

Vercel projects:

- Frontend project: `vercel`
- Backend project: `vercel-backend`

Current production URLs:

- Frontend (canonical alias): `https://timer.dev.webforxtech.com`
- Frontend alias: `https://vercel-self-five-79.vercel.app`
- Frontend alias: `https://vercel-alozeus-projects.vercel.app`
- Frontend alias: `https://vercel-alozeus1-alozeus-projects.vercel.app`
- Backend (canonical alias): `https://api.dev.webforxtech.com`
- Backend API base: `https://api.dev.webforxtech.com/api/v1`

Google OAuth callback (production):

- `https://api.dev.webforxtech.com/api/v1/calendar/callback`

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
- Production idle policy is warning after 15 minutes and pause after 20 minutes.

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
- `/schedule`
- `/expenses`
- `/geofencing` (Admin)
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
- `/schedules`
- `/expenses`
- `/geofences`

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
- Required for production: `npm run release:migrate`
- Never run `prisma db push` against production or a shared database.
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
curl -i -X POST https://api.dev.webforxtech.com/api/v1/auth/login \
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

### Weekly report covers the wrong dates / a day is missing

Fixed 2026-08-03. The weekly export window was derived from server-local time as
`[now-6d 00:00, now+1d 00:00)`, producing a Tuesday-to-Monday window and dropping one
working day from every weekly report. Windows are now Monday 00:00:00 to Sunday
23:59:59 in each report's `reporting_timezone`, generated the following Monday at
`schedule_generation_time` (default 06:00 local).

Checks:

1. Confirm `reporting_timezone` on the scheduled report matches where the team works.
2. Confirm the **Scheduled Reports Tick** GitHub Actions workflow is enabled and running
   hourly. It lives in GH Actions rather than `backend/vercel.json` because Vercel's Hobby
   plan rejects sub-daily cron expressions at deploy time. A daily tick cannot serve
   timezones far from UTC. GitHub auto-disables scheduled workflows after 60 days of
   repository inactivity, and that failure is silent.
3. If a report did not send, check the logs for `[ReportValidation] FAIL` — the report may
   have been correctly blocked by a validation gate (returns HTTP 200, `status: validation_blocked`).

Full reference: `docs/scheduled-report-windows.md`.

### A page renders blank in production but works locally

Fixed for `/schedule` on 2026-08-04; the pattern will recur.

`frontend/vercel.json` sets a strict CSP that the Vite dev server does **not** apply, so
CSP-caused failures are invisible locally and in CI and only appear in production.

`/schedule` was blank for every user because `style-src 'self'` blocked FullCalendar v6's
runtime style injection. FullCalendar ships no CSS files — it creates a `<style>` element
and calls `sheet.insertRule(...)`. Under that policy the element is allowed into the DOM
but not applied, so `styleEl.sheet` is `null`, and FullCalendar's `injectStyles` reads
`sheet.cssRules.length` without a guard:

```
TypeError: Cannot read properties of null (reading 'cssRules')
```

Checks:

1. Compare the served policy with what the library needs:
   `curl -sI https://timer.dev.webforxtech.com/<route> | grep -i content-security-policy`
2. `style-src` must keep `'unsafe-inline'` for as long as any dependency injects styles at
   runtime. `frontend/src/tests/contentSecurityPolicy.test.ts` fails CI if it is removed —
   read that file's header before changing the policy.
3. All routed pages are wrapped in `ErrorBoundary`, so a render throw now shows an error
   card rather than a blank page. If you get a blank page again, the boundary was bypassed
   (an error thrown outside render, e.g. in an event handler or async callback).

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
5. Before GitHub operations, run `gh auth status --hostname github.com` and confirm the active account is `alozeus1`.
6. If deployment-impacting, verify current Vercel URLs and env key presence before changing code.
7. Execute the smallest safe change and run build checks.
8. Update this handbook if deployment topology or core behavior changed.

## 18. GitHub Repository And Authentication

- GitHub account: `alozeus1`
- Repository: `https://github.com/alozeus1/webforx-time-tracker`
- Git remote: `origin`
- Git protocol: HTTPS

Authentication is stored in the macOS Keychain for the local OS account. Codex,
Claude, Kimi, and other local agents running as this user should use the existing
credential store:

```bash
gh auth status --hostname github.com
gh auth setup-git
git fetch origin
```

Never put a GitHub PAT in this handbook, a Git remote URL, an environment file,
shell history, source code, or a commit. If authentication expires, the operator
must rotate or replace the credential using `gh auth login --hostname github.com`
and then rerun `gh auth setup-git`.

### 18a. Claude Cowork Sandbox Authentication

The Cowork sandbox is an isolated Linux environment. It mounts the project folder
but cannot access the macOS Keychain or the Mac's global `~/.gitconfig`. The
`gh` credential store is therefore unavailable inside the sandbox.

**Credential file (operator creates once, never committed):**

The operator should create a file `.claude-secrets` in the project root:

```
GITHUB_USERNAME=alozeus1
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx
```

This file is gitignored (see `.gitignore`). Claude must never create or modify
this file — the operator owns it. Claude must never log its contents.

**What Claude does at the start of any session that requires a git push:**

1. Check whether `.claude-secrets` exists in the project root.
2. If it exists, read `GITHUB_USERNAME` and `GITHUB_PAT` from it.
3. Run the following to configure credentials for all `github.com` repos in
   this sandbox session (ephemeral — resets when the session ends):

```bash
source .claude-secrets
git config --global \
  url."https://${GITHUB_USERNAME}:${GITHUB_PAT}@github.com/".insteadOf \
  "https://github.com/"
```

4. Proceed with `git add -A && git commit -m "..." && git push`.
5. After pushing, verify with `git log --oneline -1`.

**Required PAT permissions (Fine-grained, scoped to `webforx-time-tracker`):**

- Contents → Read & Write
- Metadata → Read-only (granted automatically)

**Token rotation:** When the PAT expires, the operator updates `.claude-secrets`
with the new token. No other file changes are needed.
