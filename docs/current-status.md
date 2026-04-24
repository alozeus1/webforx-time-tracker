# Current Application Status

Last reviewed: 2026-04-23

This document summarizes the current implementation against:

- [docs/mvp.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/mvp.md)
- [docs/app-route.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/app-route.md)
- [AGENT_HANDBOOK.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/AGENT_HANDBOOK.md)
- [DEPLOYMENT.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/DEPLOYMENT.md)

## Overall Status

Current maturity: production-shaped internal MVP with premium launch features.

The project has a working React/Vite frontend, Express/Prisma backend, Electron desktop wrapper, automated backend/frontend tests, Vercel deployment configuration, Prisma migrations, and release guard scripts.

The app is no longer a scaffold. Core auth, seeded roles/projects, server-backed timers, pause/resume behavior, manual entries, approvals, reports, admin surfaces, integrations, demo tour, request-access flow, and cron endpoints are implemented.

Remaining risk is mostly product depth and repo hygiene, not missing foundations.

## Recent Implemented Capabilities

- [x] Server-backed timer start, stop, pause, resume, heartbeat, and refresh-safe active timer state
- [x] Idle handling that soft-pauses explicitly inactive browser sessions and hard-stops stale timers
- [x] Pagehide pause beacon for tab/window close behavior
- [x] Manual entry approval warnings and pending approval badges
- [x] Manager/admin approval endpoints and frontend approval queues
- [x] Demo tour at `/demo`
- [x] Conditional demo user seed and demo data reset cron route
- [x] Public request-access API and database model
- [x] Resend-backed access request notification/receipt path with graceful no-email fallback
- [x] Public landing, privacy, terms, forgot-password, request-access, and shared artifact routes
- [x] Expanded admin/team/reporting/workday/invoice/template/webhook/scheduled-report surfaces
- [x] Backend Jest/Supertest tests and frontend Vitest/Playwright tests exist

## Runtime Surfaces

- [x] Frontend: [frontend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/frontend)
- [x] Backend: [backend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/backend)
- [x] Desktop wrapper: [desktop](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/desktop)
- [x] Demo video tooling: [video](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/video)
- [x] Product/deployment docs: [docs](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs)

## Implemented Backend Areas

- [x] Auth, refresh, forgot/reset password
- [x] Users and role-aware middleware
- [x] Projects, budgets, and project membership
- [x] Timers, manual entries, pause/resume, ping, pause beacon, approval review
- [x] Reports and export endpoints
- [x] Integrations, Google Calendar, ML categorization
- [x] Admin, audit/auth events, tags
- [x] Webhooks, invoices, templates, scheduled reports
- [x] Public routes and request-access contact route
- [x] Cron routes for idle, workload, daily notifications, and demo reset
- [x] Background workers for notifications, idle tracking, and burnout/workload tracking

## Implemented Frontend Areas

- [x] Public marketing/landing pages
- [x] Login, forgot password, request access, demo tour
- [x] Dashboard, workday, timer, timeline, timesheet, reports
- [x] Team and admin management
- [x] Integrations, profile, settings
- [x] Invoices, templates, webhooks, scheduled reports
- [x] Shared artifact view
- [x] Help chatbot, command palette, onboarding tour, resume confirmation dialog

## Current Gaps And Decisions

### 1. Admin Role Boundary

Status: needs product decision

`docs/mvp.md` defines `/admin` as Admin-only. The current frontend route allows `Admin` and `Manager` for `/admin`. Decide whether to keep manager access as a deliberate product expansion or restore Admin-only routing.

### 2. Reporting Depth

Status: partially complete

Reports, workday, and ops insight services exist, but future work should verify every displayed analytics number is computed from live backend data and matches manager/admin authorization rules.

### 3. Environment Readiness

Status: deployment-dependent

Production requires `DATABASE_URL`, `JWT_SECRET`, `INTEGRATION_SECRET`, `CRON_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL`, `NODE_ENV=production`, `ENABLE_BACKGROUND_WORKERS`, and frontend `VITE_API_URL`. Google Calendar, Resend email, Authentik, and demo user seeding remain environment-gated.

### 4. Repository Hygiene

Status: needs cleanup before transfer

The current worktree contains local/deployment/generated/untracked artifacts. See [docs/repo-transfer-checklist.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/repo-transfer-checklist.md) before pushing to a new repository.

### 5. Generated Backend Dist Files

Status: needs decision

`backend/dist` is currently tracked and has local modifications. Vercel backend builds from `backend/src/index.ts`; decide whether `backend/dist` should remain tracked for runtime compatibility or be removed from version control before transfer.

## Verification Commands

Run before a transfer branch is merged or pushed:

```bash
cd backend && npm run build && npm test
cd ../frontend && npm run build && npm run lint && npm run test:unit
```

Recommended release checks:

```bash
cd backend && npm run release:preflight
cd ../frontend && npm run test:e2e
```

## Definition Of Ready For New-Repo Transfer

- [ ] No secrets or `.env*` files are staged
- [ ] `.vercel/`, `.superpowers/`, generated reports, and local media output are excluded unless intentionally included
- [ ] `backend/dist` tracking decision is made and documented
- [ ] `docs/app-route.md` reflects the implemented route surface
- [ ] Admin/manager access to `/admin` is accepted or corrected
- [ ] Backend and frontend build/test checks pass
- [ ] New repo visibility is known: private internal vs public sanitized
- [ ] Deployment env requirements are copied into the new host, not committed

## Bottom Line

The application is feature-rich enough for internal demonstration and staged production hardening. Before pushing it to a new repository, the priority is cleanup, documentation alignment, and an explicit decision on secrets, generated files, and repo visibility.
