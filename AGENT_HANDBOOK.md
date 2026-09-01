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

Integration readiness:

- GitHub commit signals use the tenant's encrypted repository/token configuration and
  the live GitHub REST API. Use a repository-scoped fine-grained token with Contents read.
- Jira, Linear, Asana, ClickUp, and Trello configuration surfaces are preview-only; they
  do not perform live sync.
- QuickBooks sync is not implemented and fails closed with HTTP 501.
- Webhook retries are bounded and best-effort; they are not a durable delivery queue.

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

### Backend email (AWS SES SMTP — primary transport)

All webforxtech.com and dev.webforxtech.com mail goes through AWS SES SMTP:

- `AWS_SES_SMTP_ENDPOINT`
- `AWS_SES_SMTP_PORT` (587 = STARTTLS, the WFT default; 465 = implicit TLS)
- `AWS_SMTP_USERNAME`
- `AWS_SMTP_PASSWORD` (an SES SMTP password derived from an IAM key — NOT an AWS secret access key)
- `EMAIL_FROM` (must be a verified identity in SES, or every send is rejected)

`RESEND_API_KEY` is retained only as a rollback path. `services/mailer.ts` prefers SMTP
whenever the three SMTP variables are all present, and falls back to Resend otherwise, so
the transport can be reverted by changing environment variables rather than redeploying.
A partially configured SMTP block does NOT select SES — it falls back — so a missing
credential cannot produce opaque auth failures at send time.

Migration note: Resend rejected every send on 2026-08-10 ("The webforxtech.com domain is
not verified"), which silently broke the weekly compliance report and, downstream, the
n8n Mattermost publication. Verify the sending domain in SES before relying on delivery.

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
- `TimerCorrectionRequest`, `RecoveryOverrideGrant`
- `TimerPolicyConfig`
- `Notification`, `AuditLog`
- `Integration`
- `CalendarConnection`
- `ReportCache`

### Timer guardrails (added 2026-08-12)

Four rules constrain how time can be added. All are server-enforced; the UI only
renders what the server reports.

- **Daily cap.** 8h per calendar day in the *user's own* timezone (`User.timezone`,
  reported by the browser; falls back to UTC). Enforced on `POST /timers/start`,
  `/timers/manual`, `/timers/corrections`, and `PUT /timers/:id`. Exceeding it is
  allowed but requires an attestation — a reason of at least 20 characters plus an
  acknowledgement — which is stored on the entry as `over_daily_cap` +
  `overtime_reason` and adds 35 points to its risk score.
- **Intern daily floor.** 2h. Passing it raises a soft, once-per-day nudge with no
  justification required. It is a target to reach, not a ceiling. Driven by
  `User.employment_type`, never by the access role.
- **Clash detection.** `services/timeOverlapService.ts` is the single overlap check,
  used by every write path. It considers `pending` *and* `approved` entries plus other
  `PENDING` correction requests. Half-open ranges, so 09:00–10:00 and 10:00–11:00 do
  not clash. Returns `409 { code: 'TIME_OVERLAP', conflicts: [...] }`.
- **Recovered-time quota.** 3 correction requests per Monday-based week per user.
  Requests 1–2 pass freely; the last one in the allowance demands a 40-character
  reason plus an acknowledgement; beyond it returns `403 RECOVERY_LIMIT_REACHED`. A
  rejected request does **not** consume a slot. An Admin can grant extra headroom for
  one week via `POST /admin/recovery-grants`.

Policy values live on the GLOBAL `TimerPolicyConfig` row and are editable at
Admin → Policy: `daily_cap_hours`, `intern_daily_floor_hours`,
`weekly_recovery_limit`, `abandoned_timer_grace_minutes`.

### Abandoned timers

A timer left running on a closed browser is stopped by the sweep at
`GET /api/v1/cron/idle` with `stop_reason: 'abandoned_timer'`, and its end time is
**clamped** back to the last heartbeat plus `abandoned_timer_grace_minutes`. Time
after the last proof of activity is never credited. The same clamping applies to
`active_duration_limit`.

`backend/vercel.json` can only schedule this daily (Hobby rejects sub-daily cron), so
the real cadence comes from `.github/workflows/timer-sweep.yml` every 15 minutes —
the same workaround as the scheduled-reports tick. Each run stamps
`TimerPolicyConfig.last_sweep_at`; Admin → Policy shows the age and turns red past an
hour, because **GitHub disables scheduled workflows silently** after 60 days of
repository inactivity.

All three cap enforcers (inline request guardrail, cron sweep, and the client) now
compare *counted* time — elapsed minus paused — and a client-initiated cap stop sends
`{ reason: 'active_duration_limit' }` so it produces the identical record whichever
enforcer wins the race.

### Timesheet rejection reasons (added 2026-09-01)

Rejecting a time entry requires a reason. Approving one clears any reason a previous
rejection left behind.

**Where the taxonomy lives:** `backend/src/constants/rejectionReasons.ts`, and only
there. `backend/` and `frontend/` are separate npm packages and `backend/tsconfig.json`
pins `rootDir: ./src`, so a module imported by both would break `npm run build`. Rather
than keep two lists that drift, the backend resolves the label:

- Entry payloads carry `rejection_reason_label` alongside the code, so no client-side
  lookup table is needed to render a rejection.
- The manager's reason picker reads `GET /api/v1/timers/rejection-reasons`.

Codes are stored, labels are not, so wording changes need no migration. Adding or
renaming a reason means editing that one file — never a second copy.

| Code | Label |
|---|---|
| `EXCEEDS_DAILY_CAP` | Exceeds the 8-hour daily cap |
| `IDLE_TIMER_OVERRUN` | Timer left running / idle — duration overstated |
| `OVERLAPPING_ENTRY` | Overlaps hours already submitted |
| `WRONG_PROJECT` | Wrong or missing project assignment |
| `INSUFFICIENT_DESCRIPTION` | Task description too vague or incomplete |
| `NOT_COMPANY_WORK` | Not company work |
| `DUPLICATE_ENTRY` | Duplicate of another entry |
| `OTHER` | Other — reason required (a non-empty note is mandatory) |

**Three write paths set `status = 'rejected'`**, and all three run the same
`validateRejectionReason` helper — a reason is never optional on one of them:

- `POST /timers/approvals/:entryId` (`reviewTimesheet`)
- `POST /timers/approvals/bulk` (`reviewTimesheetsBulk`) — one reason applies to the
  whole selection rather than blocking bulk review
- `PATCH /timers/bulk` with `action: 'reject'` (`bulkUpdateEntries`)

Free text is capped at `REJECTION_NOTE_MAX_LENGTH` (500) and HTML-escaped before it
reaches an email body.

**Historical rows have no reason and must keep it that way.** The migration
(`20260901000000_timesheet_rejection_reasons`) does not backfill: entries rejected
before this shipped record a null code, and every surface renders that as
"No reason recorded". Never invent one.

**Notification.** `services/rejectionNoticeService.ts` sends one email per affected
person per reviewer action — never one per entry — through the SES SMTP mailer. It runs
after the transaction commits and swallows its own failures, logging
`[rejectionNotice] FAILED`: SES being down must never undo a rejection a manager has
already made. Grep that prefix when someone says they were not told.

**The screen.** `/timesheet` leads with **Approved**, labelled as the figure counted
toward a weekly minimum, with Rejected and Pending beside it and total logged still
shown below. `GET /timers/me` accepts an optional `?from=&to=` window and returns a
`totals` block for it; callers that omit the window get exactly the old response and
pay for no extra aggregate. Compliance calculation itself is unchanged.

### Audit log visibility

`GET /api/v1/admin/audit-logs` is `requireRole(['Admin'])`. `/admin` itself is open to
Managers, so the Audit Logs tab and its fetch are both gated on the stored role in
`frontend/src/pages/Admin.tsx` (`adminOnlyTabs`). Adding another privileged tab means
adding it to that set, not just relying on the backend to 403.

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

**Migrations run BEFORE the backend deploy, not after.**

This reverses the order this section used to document, and the old order would have
caused a full outage. Prisma generates an explicit column list for every query from
the schema it was built against, so a backend carrying a newer schema than the
database fails on essentially every request:

```
Invalid `prisma.timeEntry.findFirst()` invocation:
The column `TimeEntry.over_daily_cap` does not exist in the current database.
```

That is the timer, timesheet, approvals and reports all down for the whole window
between deploy and migrate. Verified empirically on 2026-08-12 by rewinding a local
database to the pre-release schema and querying it with the new client.

The reverse — an additive migration applied while the *old* backend is still serving
— is safe: the old client never selects the new columns, and new columns are either
nullable or defaulted, so its inserts still succeed. That is what makes
migrate-first correct.

This ordering assumes additive migrations, which is the only kind that should reach
production. A destructive change (dropping or renaming a column still read by live
code) cannot be made safe by ordering alone and must be split across two releases:
ship code that stops using the column, deploy, then drop it.

For safe production rollout:

1. Update backend env vars first.
2. **Run DB migrations.**
- Required for production: `npm run release:migrate`
- Never run `prisma db push` against production or a shared database.
- Prove the migration first: `bash scripts/gauntlet.sh --with-db` (fresh provision,
  zero drift, idempotent re-run). Set `MIGRATION_TEST_DATABASE_URL` to a disposable
  database if Docker is unavailable.
3. Deploy backend (`vercel deploy --prod`).
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
