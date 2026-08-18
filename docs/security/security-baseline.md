# Security baseline

**Baseline commit:** `d0b3828b6f0aaf05a93cc4560dbc5ce3320bd9bb`  
**Working branch:** `security/zero-trust-endpoint-hardening`  
**Recorded:** 2026-08-18

## Architecture and trust boundaries

The application has three deployable surfaces: a React/Vite browser client, an
Express/TypeScript API backed by Prisma/PostgreSQL, and an Electron desktop
wrapper. Deployment documentation identifies Vercel for the web/API deployment
and Neon-hosted PostgreSQL. Browser-to-API traffic crosses the public internet;
the API then crosses a separate trust boundary to PostgreSQL, AWS SES SMTP,
Google, Slack, Mattermost, GitHub, QuickBooks, object storage, and configured
webhook destinations.

The repository proves application controls, but it cannot itself prove edge TLS,
WAF, certificate renewal, provider encryption-at-rest, database network policy,
or Vercel runtime-secret access. Those are operator verification items, not
assumptions.

## Production-critical flows

Login/logout/token refresh and MFA; timer start/pause/resume/stop, heartbeat and
beacon pause; manual time and correction review; approvals; reports/PDF and
scheduled email; admin teams, policies, audit history and organisation settings;
integrations, bot callbacks and outgoing webhooks; cron-driven sweep, report and
retention jobs.

## Controls present in source

- Helmet, HSTS, CSP, referrer policy, exact credentialed CORS origins, JSON body
  limit, global and authentication rate limits (`backend/src/index.ts`).
- JWT server verification, database-backed organisation completion, and router
  role gates (`backend/src/middlewares/auth.ts`).
- Signed double-submit CSRF protection for cookie-authenticated mutations,
  secure/HttpOnly production cookies, and an explicit bearer-token exception
  (`backend/src/middlewares/csrf.ts`, `backend/src/config/cookies.ts`).
- Cron shared-secret gate, provider-specific Slack HMAC verification and
  integration configuration encryption paths.
- Pinned GitHub Actions, dependency audit guard, secret-pattern scan, CodeQL,
  Prisma migration guard, backend/frontend/desktop validation.

## Baseline constraints and exclusions

Untracked SES cutover artifacts already in the working tree are user-owned and
are excluded from this branch. No production deployment, secret rotation,
configuration mutation, destructive database action, authenticated production
probe, or blocking-mode edge control is authorised by this baseline.

## Baseline validation

The normal non-database validation command, run on this baseline, passed:

- backend typecheck/build/cron check and **42 suites / 437 tests**;
- frontend lint/build/unit tests and **25 files / 125 tests**;
- desktop validation and **5 tests**;
- production dependency audit guard for backend, frontend and desktop with zero
  advisory references.

The backend test process emitted its documented worker-handle teardown warning
after assertions passed. It is a pre-existing test-hygiene issue, not suppressed
by this work. Database replay and browser E2E require an isolated disposable
database and running preview stack respectively, and were not run against
production.
