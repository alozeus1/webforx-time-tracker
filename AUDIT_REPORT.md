# Web Forx Time Tracker — Production Readiness Audit

**Audit type:** Independent, adversarial, read-only (no code or infrastructure was modified)
**Audit date:** 2026-07-17
**Repository:** `webforx-time-tracker` (local working tree)
**Branch / commit:** `main` @ `d9c3d23` (`feat(admin): filter + CSV export for Audit Logs and Correction Requests`), working tree clean
**Environments examined:** Source tree + Linux sandbox execution (install/build/typecheck/lint/unit tests/dependency audit). Live production (Vercel/Neon) and real integration sandboxes were **not** accessible and were **not** tested.

---

## 1. Executive Summary

Web Forx Time Tracker is a multi-tenant (organization-scoped) internal time-tracking SaaS with three surfaces: a React + Vite web app, an Express 5 + Prisma 5 + PostgreSQL backend, and an Electron desktop wrapper. It is deployed on Vercel (frontend + backend) with Neon PostgreSQL. It supports timers, timesheets, approvals, reports (CSV/PDF), leave, payroll, invoicing, MFA (TOTP), Google Calendar, Taiga, Mattermost/Slack/Teams bots, webhooks, and background workers (idle/burnout/notifications).

The codebase is, in most places, well-engineered: tenant scoping is applied correctly in the large majority of controllers, Helmet + CSP + HSTS is configured on the API, rate limiting covers auth routes, integration configs are AES-256-GCM encrypted, cron routes require `CRON_SECRET`, and there is a real server-side RBAC guard (`assertCanAssignRole`). Both apps build cleanly, typecheck cleanly, and the automated test suites pass (backend 31/31 on the sampled suite in-band; frontend 61/61 unit).

However, the audit found **confirmed, exploitable cross-tenant data-isolation failures**, an **unsafe migration/deploy pipeline**, an **MFA bypass**, **CI that does not actually gate releases**, and **multiple high-severity dependency vulnerabilities in production code paths**. These are release blockers.

**Findings by severity:** P0: 0 · P1: 9 · P2: 15 · P3: 12

**Highest-risk areas:** (1) tenant isolation in `admin`/`organization`/`webhook` code paths, (2) database migration + deploy integrity, (3) CI/CD gating and supply-chain hygiene, (4) authentication (MFA bypass via SSO), (5) dependency freshness.

**Checks that could NOT be completed (and why):**
- End-to-end tests (Playwright) — requires running frontend+backend+browsers; not run.
- Migration execution against a real/representative DB — no database available in sandbox; analyzed statically.
- Live integration behavior (Google/Taiga/Mattermost/Slack/Resend) against sandboxes — no credentials; analyzed statically.
- Load/performance testing and real-device responsive/accessibility testing — not performed; bundle-size and query-shape risks inferred statically.
- Backup/restore (Neon) and rollback drills — documented only; never demonstrated.
- Jest full-suite parallel run — the sandbox OOM-killed parallel workers; verified functionally in `--runInBand` instead.

---

## 2. Release Verdict

# ❌ NOT READY FOR PRODUCTION

**Evidence supporting the decision:**

1. **Confirmed cross-tenant data exposure.** `webhookService.emitWebhookEvent` delivers every org's events to every active webhook subscription across all tenants (`backend/src/services/webhookService.ts:6`). `listOrganizations` returns *all* organizations (including billing email) to any Manager (`backend/src/controllers/organizationController.ts:8`). `getTeams`/`updateTeam` operate on a `Team` table that has **no `organization_id` column at all** — teams are global and cross-tenant readable/writable (`backend/src/controllers/adminController.ts:270,348`, `backend/prisma/schema.prisma:116`). Any confirmed tenant-isolation failure is, by the audit's own rules and standard SaaS practice, a production blocker.

2. **Unsafe schema deployment.** `postinstall` runs `prisma migrate deploy` on *every* `npm install` (contributor machines, CI, Vercel build) against whatever `DATABASE_URL` is set, with no human gate (`backend/package.json:17`). The committed migrations cannot bootstrap a fresh database (no initial `CREATE TABLE` for core models; earliest migration `ALTER`s a non-existent `Notification` table; no `migration_lock.toml`), and `DEPLOYMENT.md` contradicts itself on `db push` vs `migrate deploy`. Deploys are non-deterministic and not safely reversible.

3. **Authentication control bypass.** Google SSO login issues a full session with no `mfa_enabled` check, so a user who enabled MFA can bypass it entirely via SSO (`backend/src/controllers/googleAuthController.ts:87–97`).

4. **CI does not gate releases.** The only job that runs on PR/push is the accessibility guard; schema-drift and login-smoke are gated behind `workflow_dispatch`/`workflow_call` and never run automatically, and Vercel deploys from its own Git integration independent of these checks. There is no lint/unit/typecheck/dependency/SAST gate anywhere (`.github/workflows/release-guards.yml`).

5. **High-severity production dependencies.** Frontend production tree has 4 high-severity vulns (axios SSRF/auth-bypass/prototype-pollution; react-router RCE/open-redirect/XSS; form-data CRLF). Backend production tree has 1 high (path-to-regexp ReDoS) + 9 moderate. All have fixes available.

None of these require production access to confirm — they are verifiable in the source and were reproduced by direct code inspection and sandbox execution.

---

## 3. Production Blockers (P0 / P1)

> No P0 (no confirmed data loss, RCE-in-our-code, or exposed *committed* production secret was found). The following P1 items must be closed or formally risk-accepted before release.

### BLK-1 (P1) — Webhook delivery broadcasts events across all tenants
- **Component:** Webhooks / tenant isolation
- **Evidence:** `backend/src/services/webhookService.ts:6` — `prisma.webhookSubscription.findMany({ where: { is_active: true } })` has no `organization_id` filter. Emitters fire org-scoped payloads (`timeEntryController.ts:323` → `timer.stopped` with `user_id`, `project_id`, `duration`). Delivery selects **every** active subscription and signs with that subscriber's own secret (so it passes their signature check).
- **Reproduction:** Org B registers a webhook subscribing to `timer.stopped` or `"*"`. When any user in Org A stops a timer, Org B's endpoint receives Org A's `user_id`/`project_id`/activity metadata.
- **Impact:** Cross-tenant PII / activity exfiltration to any customer who can create a subscription (self-service).
- **Fix:** Filter subscriptions by the event's `organization_id`; thread org id through `emitWebhookEvent`.
- **Validation:** Test that an Org B subscription never receives an Org A event; add a tenant-isolation integration test.

### BLK-2 (P1) — `listOrganizations` leaks every organization to any Manager
- **Component:** Organizations / tenant isolation
- **Evidence:** `backend/src/controllers/organizationController.ts:8` — `where: user.role === 'Admin' && user.organization_id ? { id: ... } : undefined`. Route allows `['Admin','Manager']` (`organizationRoutes.ts`). A **Manager** hits the `undefined` branch → all org rows returned, including `billing_email`, `slug`, `settings`. The "super-admin" in the comment does not exist.
- **Reproduction:** Authenticate as any Manager → `GET /api/v1/organizations` → receive all tenants.
- **Impact:** Cross-tenant disclosure of org + billing metadata.
- **Fix:** Always scope to `req.user.organization_id` (or remove the endpoint from the Manager role and gate a true super-admin behind a distinct claim).
- **Validation:** Manager receives only their own org; add authz test.

### BLK-3 (P1) — `Team` is not tenant-scoped; `getTeams` leaks all tenants' teams
- **Component:** Teams / data model / tenant isolation
- **Evidence:** `backend/prisma/schema.prisma:116` — `model Team` has **no `organization_id`** and a global `@unique(name)`. `backend/src/controllers/adminController.ts:270` — `getTeams` calls `prisma.team.findMany()` with no scope (arg is `_req`, unused). Route allows `['Admin','Manager']`.
- **Impact:** Every tenant's team names/descriptions are visible to any Admin/Manager of any tenant; also enables cross-tenant team-name collisions.
- **Fix:** Add `organization_id` to `Team` (+ backfill migration), make `@@unique([name, organization_id])`, and scope all team queries.
- **Validation:** Cross-tenant team read returns nothing; migration verified on representative data.

### BLK-4 (P1) — `updateTeam` cross-tenant write (IDOR)
- **Component:** Teams / tenant isolation
- **Evidence:** `backend/src/controllers/adminController.ts:348` — `prisma.team.update({ where: { id: teamId }, data })` with no org-scoped ownership check (contrast with `leaveController`/`payrollController`, which do an org-scoped `findFirst` first).
- **Impact:** An Admin in Org A can rename or deactivate (`is_active:false`) any team, including other tenants', by supplying its id.
- **Fix:** Once `Team.organization_id` exists (BLK-3), scope the `where` by org and pre-check ownership.
- **Validation:** Cross-tenant update returns 404/403; regression test.

### BLK-5 (P1) — MFA bypass via Google SSO
- **Component:** Authentication
- **Evidence:** `backend/src/controllers/googleAuthController.ts:87–97` — after resolving the user, `generateTokens(user)` is issued with no `mfa_enabled` check. Password login *does* gate on MFA (`authController.ts:120–128`).
- **Impact:** Any user who enrolled MFA can skip the second factor by logging in with Google (if their account email matches a Google identity). Defeats an explicitly-enabled security control.
- **Fix:** Enforce the same `mfa_enabled` challenge path in `googleSignIn`.
- **Validation:** MFA-enrolled user via SSO receives an MFA challenge, not a session.

### BLK-6 (P1) — `postinstall: prisma migrate deploy` runs on every install
- **Component:** Build / deploy safety
- **Evidence:** `backend/package.json:17` — `"postinstall": "prisma generate && prisma migrate deploy"`.
- **Impact:** Every `npm install` (contributor laptops, CI, Vercel build) applies migrations to whatever `DATABASE_URL` points at, with no human gate, and fails the install if the DB is unreachable. Concurrent Vercel builds can race migrations against production.
- **Fix:** Reduce `postinstall` to `prisma generate`; run `migrate deploy` only as an explicit, gated release step.
- **Validation:** Install succeeds with no DB reachable; migrations run only in the release job.

### BLK-7 (P1) — Migrations cannot bootstrap a fresh database; no migration lock
- **Component:** Database / migrations
- **Evidence:** `backend/prisma/migrations/` — earliest migration (`20260409000000_notifications_heartbeat_idle`) opens with `ALTER TABLE "Notification" …`; there is **no initial `CREATE TABLE`** for `User`/`Organization`/`Project`/`Role`/`TimeEntry` (`grep -rl 'CREATE TABLE.*"User"'` → 0). `migration_lock.toml` is absent (hand-authored migrations). `DEPLOYMENT.md` bootstraps with `prisma db push` (§3/§7) but deploys with `migrate deploy` (§6.4) — a `db push` DB has no migration ledger, so `migrate deploy` replays everything, guarded only by ad-hoc `IF [NOT] EXISTS`.
- **Impact:** Schema provisioning is non-deterministic and not repeatable; a clean environment cannot be built from migrations; rollback is undefined.
- **Fix:** Generate a proper baseline (`prisma migrate diff` → initial migration), commit `migration_lock.toml`, standardize on `migrate deploy`, and remove `db push` from prod docs.
- **Validation:** `migrate deploy` succeeds against an empty DB and a representative snapshot; document a tested rollback.

### BLK-8 (P1) — CI/CD does not gate the release
- **Component:** CI/CD
- **Evidence:** `.github/workflows/release-guards.yml` — only `frontend-accessibility-guard` runs on `pull_request`/`push:main`; `schema-drift-guard` and `login-smoke` are `if: workflow_dispatch || workflow_call` (never auto-run). No `eslint`, no `vitest`/`jest`, no `tsc --noEmit`, no `npm audit`/CodeQL job. Vercel deploys via its own Git integration, independent of these Actions.
- **Impact:** Schema drift, type errors, failing tests, and known-vuln dependencies can reach production unblocked. "Release guards" are effectively non-functional.
- **Fix:** Run lint + unit + typecheck + schema-drift + smoke + `npm audit` on PR/push; make them required status checks; require them before the Vercel production deploy (or deploy from the workflow).
- **Validation:** A PR that breaks a test/typecheck/schema cannot merge or deploy.

### BLK-9 (P1) — High-severity vulnerabilities in production dependencies
- **Component:** Supply chain
- **Evidence (sandbox `npm audit --omit=dev`):**
  - Frontend: **5 vulns (4 high, 1 moderate)** — `axios` (SSRF via NO_PROXY bypass, auth-bypass via prototype-pollution, loopback bypass), `react-router` (RCE via turbo-stream deserialization, open redirect, XSS in redirect handling), `form-data` (CRLF), `follow-redirects` (moderate).
  - Backend: **10 vulns (1 high, 9 moderate)** — `path-to-regexp` (ReDoS), `form-data` (CRLF), `qs` (DoS), `uuid`/`svix` via `resend`.
- **Impact:** Some advisories (react-router RCE, axios auth-bypass) are severe; even if the specific vulnerable code paths aren't all reached, shipping known-high CVEs to prod is a release gate failure.
- **Fix:** `npm audit fix` / bump `axios`, `react-router(-dom)`, `resend`; re-audit. Also remove accidental backend devDependencies `npm`, `install`, `n` (see FND hygiene) which pull in `sigstore`/critical advisories.
- **Validation:** `npm audit --omit=dev` returns 0 high/critical in both apps; add an audit gate to CI (BLK-8).

---

## 4. Full Findings Register

| ID | Sev | Area | Finding | Evidence | Impact | Recommendation | Blocking |
|----|-----|------|---------|----------|--------|----------------|----------|
| BLK-1 | P1 | Tenant isolation | Webhook delivery not org-scoped | `webhookService.ts:6` | Cross-tenant PII leak | Scope subs by event org | Yes |
| BLK-2 | P1 | Tenant isolation | `listOrganizations` leaks all orgs to Managers | `organizationController.ts:8` | Cross-tenant org/billing disclosure | Always scope to caller org | Yes |
| BLK-3 | P1 | Tenant isolation | `Team` has no `organization_id`; `getTeams` unscoped | `schema.prisma:116`, `adminController.ts:270` | All tenants' teams leaked | Add org col + scope | Yes |
| BLK-4 | P1 | Tenant isolation | `updateTeam` bare-id write (IDOR) | `adminController.ts:348` | Cross-tenant team rename/disable | Org-scoped where + ownership check | Yes |
| BLK-5 | P1 | AuthN | MFA bypass via Google SSO | `googleAuthController.ts:87` | Second factor skippable | Enforce `mfa_enabled` in SSO | Yes |
| BLK-6 | P1 | Deploy | `migrate deploy` in `postinstall` | `package.json:17` | Ungated schema mutation on install | Reduce to `prisma generate` | Yes |
| BLK-7 | P1 | Migrations | No baseline/lock; can't bootstrap fresh DB | `prisma/migrations/*` | Non-deterministic, unrepeatable deploy | Baseline migration + lock | Yes |
| BLK-8 | P1 | CI/CD | Release guards don't run on PR; no lint/test/audit gate | `release-guards.yml` | Regressions/CVEs ship unblocked | Required checks + block deploy | Yes |
| BLK-9 | P1 | Supply chain | 4 high (FE) + 1 high/9 mod (BE) prod vulns | `npm audit --omit=dev` | Known-severe CVEs in prod | Upgrade + CI audit gate | Yes |
| SEC-06 | P2 | AuthZ | `updateOrganization` mass-assigns `req.body` | `organizationController.ts:60` | Admin self-tampers plan/billing/settings | Field allowlist | Recommended |
| SEC-07 | P2 | SSRF | Integration/webhook URLs unvalidated (only protocol) | `integrationController.ts:329`, `webhookService.ts:19`, `integrationController.ts:216` | Reach cloud metadata / internal hosts | Block private/link-local, allowlist | Recommended |
| SEC-08 | P2 | Secrets at rest | `mfa_secret` + Google `refresh_token` stored plaintext | `schema.prisma:66,335` | DB/backup leak → MFA + OAuth compromise | Encrypt at rest (as with `Integration.config`) | Recommended |
| SEC-09 | P2 | CSRF | `sameSite=none` cookie auth, no CSRF token; `csrfCookieOptions` defined but unused | `config/cookies.ts:9,22`, `middlewares/auth.ts:11` | CSRF on state-changing routes (mitigated by JSON-only+CORS) | Double-submit token or `sameSite=lax` | Recommended |
| SEC-10 | P2 | CORS | Reflect-any-origin branch with `credentials:true` | `index.ts:76` | Credentialed CORS if `CORS_ORIGIN=*` ever set | Hard-fail `*` with credentials | Recommended |
| SEC-11 | P2 | Session | No refresh revocation; single JWT secret for all token types; no alg pinning | `authController.ts:27,163`, `middlewares/auth.ts:22` | Captured refresh token valid until expiry; logout ineffective | jti/denylist; separate secrets; `algorithms:['HS256']` | Recommended |
| SEC-12 | P2 | Integrations | Slack slash-command timestamp not validated (replay) | `slackBotController.ts:28` | Replay of state-mutating `/timer` commands | Reject timestamps >5 min; wrap `timingSafeEqual` | Recommended |
| OPS-03 | P2 | Cron | `reset-demo` is POST but Vercel cron calls GET | `cronRoutes.ts:33` vs `vercel.json` | Dead cron; demo data never resets | Expose GET handler | Recommended |
| OPS-04 | P2 | Cron | Overlapping midnight schedules; no job lock/idempotency | `vercel.json`, `idleTracker.ts` | Double-processing timers/notifications on overlap/retry | Advisory lock + idempotency key; stagger | Recommended |
| OPS-05 | P2 | Observability | `/health` returns static `{status:'ok'}`, no DB check | `index.ts:188` | False "healthy" during DB outage | `SELECT 1` readiness probe | Recommended |
| OPS-06 | P2 | Observability | No error tracking; 206 raw `console.*`; no log aggregation | backend `src/*` | No alerting on serverless | Add Sentry + structured sink | Recommended |
| FE-01 | P2 | Frontend | Access JWT in `localStorage` | `utils/session.ts:40`, `services/api.ts` | XSS token theft | In-memory token + silent refresh | Recommended |
| FE-02 | P2 | Frontend | SPA served with no security headers (no CSP/HSTS/frame-ancestors) | `frontend/vercel.json` | Clickjacking; no XSS mitigation at edge | Add `headers` block | Recommended |
| PERF-01 | P2 | Performance | Single 1.36 MB JS bundle (380 KB gzip), no code splitting | `vite build` output | Risks <2s dashboard-load target on slow links | Route-level `import()` / manualChunks | Recommended |
| DATA-01 | P2 | Data model | Org `onDelete: Cascade` hard-deletes `AuditLog`/`AuthEvent` | `schema.prisma:283,300` | Deleting an org destroys its audit trail; no retention | Soft-delete + retention for audit tables | Recommended |
| SEC-13 | P2 | Abuse | Unauthenticated `POST /organizations`, no rate limit/validation | `organizationController.ts:37` | Signup spam / resource exhaustion | Rate limit + validation (or gate) | Recommended |
| FE-03 | P3 | Frontend | Client-only role gating in route guard | `App.tsx:38` | UI exposure only (backend enforces) | Note: defense-in-depth | No |
| SEC-14 | P3 | AuthN | Account enumeration: Google 403 oracle + login timing (bcrypt skipped when user missing) | `googleAuthController.ts:82`, `authController.ts:72` | User-existence disclosure | Generic messages; constant-time | No |
| SEC-15 | P3 | Crypto | bcrypt cost factor 10 | `authController.ts:278` et al. | Below current 12 recommendation | Raise to 12 | No |
| SEC-16 | P3 | Integrations | Mattermost token compared with `!==` (non-constant-time) | `mattermostBotController.ts:203` | Theoretical timing side-channel | `timingSafeEqual` | No |
| DATA-02 | P3 | Data model | Cross-org `project_id`/`tag_ids` not validated on entry create | `timeEntryController.ts:143` | Attach another tenant's ref to an entry | Validate refs belong to caller org | No |
| LOG-01 | P3 | Logging | Seed password + reset code logged when `RESEND_API_KEY` unset | `services/emailService.ts:93,141` | Reset code to logs if prod key forgotten | Never log secrets; gate on `NODE_ENV` | No |
| HYG-01 | P3 | Hygiene | Backend devDependencies include `npm`, `install`, `n` | `backend/package.json` | Tree bloat; pulls critical/high dev advisories | Remove | No |
| HYG-02 | P3 | Hygiene | `stitch.zip` committed 3× (~28 MB total); `dist`/`tsconfig.tsbuildinfo` present | `git ls-files` | Repo bloat/history weight | Remove; LFS/external if needed | No |
| HYG-03 | P3 | Hygiene | Duplicate/typo docs `ANITGRAVITY.md` + `ANTIGRAVITY.md`; `push-*.sh` push-to-main scripts | repo root | Confusion; encourages review/CI bypass | Consolidate; remove push scripts | No |
| HYG-04 | P3 | Supply chain | Actions pinned to mutable major tags (`@v4`) | `release-guards.yml` | Supply-chain tampering | Pin to commit SHAs | No |
| HYG-05 | P3 | Hygiene | Committed test credential (`webforxtechng@`) | `frontend/tests/team-accessibility.spec.ts:7` | Real-looking admin password in VCS | Env-driven fixtures; verify not live | No |
| SEC-17 | P1* | Secrets | Plaintext GitHub PAT in `/.claude-secrets` (gitignored, **not** committed) | repo root | Cleartext token with push→auto-deploy access on disk | Rotate now; move to keychain/short-lived | Operator action |
| FE-04 | P3 | Frontend | React "unique key" + `act()` warnings in Dashboard tests | `vitest` output | Latent render bug / noisy tests | Fix keys; wrap in `act` | No |

\* SEC-17 is rated P1-severity by exposure but is **operator-owned and not in version control**; it is a "rotate + relocate" action rather than a code blocker.

---

## 5. Product Completeness Matrix

Legend: ✅ Complete & verified · 🟡 Implemented, not fully verified · 🟠 Partial · 🔧 Mock/dev-only · ❌ Broken · ➖ N/A

| Feature (from `docs/mvp.md`) | Status | Evidence / Notes |
|------------------------------|--------|------------------|
| Email+password auth, JWT sessions, RBAC | 🟡 | Implemented; server-side `requireRole`; unit tests pass. Blockers: MFA-via-SSO bypass (BLK-5), token-in-localStorage (FE-01). |
| MFA (TOTP) | 🟠 | Implemented (otplib) but bypassable via SSO (BLK-5) and secret stored plaintext (SEC-08). |
| Time tracking (start/stop, one active timer, refresh-safe) | ✅ | `ActiveTimer` model + `timeEntry.test.ts` (31 passing incl. approvals, correction requests, pause beacon). |
| Manual time entry + audit logs | 🟡 | Implemented; cross-org ref validation gap (DATA-02). |
| Daily timeline / weekly timesheet | 🟡 | Implemented; not verified end-to-end (no e2e run). |
| Reports dashboard + CSV/PDF export | 🟡 | Implemented (jspdf/pdfkit, CSV export in recent commits); not e2e-verified. |
| Notifications (in-app + Mattermost) | 🟡 | Worker + Mattermost present; delivery not verified against live Mattermost. |
| Taiga integration | 🟡 | Encrypted config + endpoints present; not exercised against a live Taiga. |
| Mattermost/Slack/Teams bots | 🟠 | Present; Slack replay gap (SEC-12); not verified live. |
| Google Calendar | 🟡 | OAuth flow present; refresh token stored plaintext (SEC-08); not verified live. |
| Webhooks | ❌ | Cross-tenant broadcast (BLK-1) — broken/unsafe as shipped. |
| Leave / Payroll / Invoicing (beyond MVP) | 🟡 | Implemented with org scoping (better pattern than admin/org controllers); not e2e-verified. |
| Background workers (idle/burnout/notifications) | 🟠 | Implemented; no job locking/idempotency (OPS-04); dead `reset-demo` cron (OPS-03). |
| Mobile responsiveness | 🟡 | Tailwind + responsive tests exist; not verified on real viewports/devices. |
| Audit logging | 🟠 | Present and used, but org-cascade delete destroys the trail (DATA-01). |
| Observability / uptime (99.9% NFR) | ❌ | Static health check (OPS-05), no error tracking/alerting (OPS-06) — cannot meet/observe SLO. |

---

## 6. Security Assessment

- **Authentication:** Solid password login (bcrypt, rate-limited, refresh via httpOnly cookie). Weaknesses: MFA bypass via SSO (BLK-5, blocker), MFA secret plaintext (SEC-08), no refresh revocation / single JWT secret / no alg pinning (SEC-11), account enumeration (SEC-14), bcrypt cost 10 (SEC-15).
- **Authorization:** Real server-side RBAC (`requireRole`, `assertCanAssignRole`) — good. Role is a JWT claim, authoritative for the access-token TTL (~15 min) before DB re-read on refresh (acceptable, documented). Mass-assignment on org update (SEC-06).
- **Tenant isolation:** Correct in the large majority of controllers (org id from `req.user`, never trusted from body; org-scoped composite indexes). **Four confirmed breaks** in `admin`/`organization`/`webhook` paths (BLK-1..4) — the decisive blockers.
- **Input validation:** Zod used across many routes; no raw SQL anywhere (`$queryRawUnsafe`/`$executeRaw` grep = 0) → no first-order SQLi. SSRF via outbound integration/webhook fetch (SEC-07).
- **Secrets:** `INTEGRATION_SECRET` required in prod, AES-256-GCM for integration config (good). Plaintext MFA/OAuth secrets (SEC-08); PAT on disk (SEC-17); potential secret logging path (LOG-01). No secrets committed to VCS (verified: no `.env`, no tokens tracked).
- **Dependency risk:** High (BLK-9) — 4 high FE / 1 high + 9 mod BE in production trees; more in dev tree from accidental `npm`/`n`/`install` devDeps (HYG-01).
- **Infra security:** API has Helmet + CSP + HSTS; SPA has **no** edge security headers (FE-02); CORS reflect-with-credentials latent risk (SEC-10).
- **Data protection:** Org-cascade delete destroys audit/auth-event history with no retention (DATA-01).
- **Logging & privacy:** Correlation IDs present (good); 206 raw `console.*`, no aggregation/alerting (OPS-06); reset-code logging path (LOG-01). Request logger logs path only (no query string) — reset codes in query string not captured (good).
- **Abuse controls:** Global (300/15m) + auth (15/15m) rate limiters (good); unauthenticated org creation unthrottled (SEC-13); Slack replay (SEC-12).

---

## 7. Test & Validation Results (executed in Linux sandbox)

| Check | Command | Result |
|-------|---------|--------|
| Backend install | `npm install --ignore-scripts` | ✅ exit 0 (661 pkgs) |
| Backend Prisma client | `npx prisma generate` | ✅ exit 0 |
| Backend build (typecheck) | `npm run build` (`tsc`) | ✅ exit 0 |
| Backend unit/integration | `npx jest tests/timeEntry.test.ts --runInBand` | ✅ 31/31 passed |
| Backend full jest (parallel) | `npm test` | ⚠️ workers SIGKILL'd (sandbox OOM, not test failures) — verified in-band instead |
| Backend prod audit | `npm audit --omit=dev` | ❌ 10 vulns (1 high, 9 moderate) |
| Frontend install | `npm install --ignore-scripts` | ✅ exit 0 (445 pkgs) |
| Frontend typecheck | `npx tsc -b` | ✅ exit 0 |
| Frontend lint | `npm run lint` | ✅ exit 0 (2 warnings) |
| Frontend unit | `npx vitest run` | ✅ 61/61 passed (12 files); minor React key/act warnings |
| Frontend build | `npm run build` | ✅ exit 0; ⚠️ 1.36 MB single chunk |
| Frontend prod audit | `npm audit --omit=dev` | ❌ 5 vulns (4 high, 1 moderate) |
| `TODO/FIXME/HACK` scan | grep | ✅ 0 in `src` |

**Not executed (evidence gaps to close before release):** Playwright e2e; `migrate deploy` against empty + representative DB; live integration calls (Google/Taiga/Mattermost/Slack/Resend); load/perf tests; real-device responsive + screen-reader accessibility; Neon backup/restore + rollback drill.

**Test-quality note:** Backend tests mock Prisma (fast, DB-free) — good for unit coverage, but there are **no tenant-isolation integration tests** that would have caught BLK-1..4, and access-control tests don't attempt real cross-tenant bypasses. This is the highest-value test gap.

---

## 8. Infrastructure & Deployment Assessment

- **Production architecture:** Vercel (frontend `vercel`, backend `vercel-backend`) + Neon PostgreSQL; stateless serverless backend; Vercel Cron for workers.
- **Environment readiness:** Env matrix documented (`AGENT_HANDBOOK.md §7`); `INTEGRATION_SECRET` required in prod; frontend build-time `VITE_API_URL`. No startup validation demonstrated for all required prod vars.
- **CI/CD readiness:** ❌ Not ready — release guards don't gate (BLK-8); no lint/test/typecheck/audit gate; Actions on mutable tags (HYG-04).
- **Migration readiness:** ❌ Not ready — `postinstall` migrate (BLK-6); no baseline/lock; db-push vs migrate-deploy contradiction (BLK-7).
- **Rollback readiness:** 🟠 App-tier rollback is plausible (promote prior Vercel deploy); DB rollback undefined given migration state (BLK-7). Never drilled.
- **DNS/TLS:** Managed by Vercel (not independently verified); multi-origin CORS parsing present.
- **Secrets readiness:** 🟠 Server secrets via Vercel env; plaintext at-rest gaps (SEC-08) and PAT-on-disk (SEC-17).
- **Backup/restore readiness:** ❌ Documented Neon policy only; **never restored/tested** — does not count as verified recovery.
- **Observability readiness:** ❌ Static health check, no error tracking/alerting (OPS-05/06).
- **Edge security headers:** ❌ Missing on SPA (FE-02).
- **Cron config:** ⚠️ Dead `reset-demo` (OPS-03); overlapping schedules without locking (OPS-04).

---

## 9. UI/UX & Accessibility Findings

Static/execution-based only (no live browser session run):
- **Accessibility:** Dedicated Playwright specs exist (`team-accessibility`, `disclosure-keyboard`, `team-mobile-layout`) — a positive signal — but were **not executed** here and don't run in CI on PRs (BLK-8). Coverage breadth unverified.
- **Robustness:** Vitest suites cover visible API error feedback, search behavior, and paused-timer live-hours — good. Minor React "unique key" warning in `Dashboard` and `act()` warnings (FE-04).
- **Client role gating:** `ProtectedRoute` reads role from `localStorage` (FE-03) — UI exposure only; backend enforces authz.
- **Performance:** 1.36 MB monolithic bundle (PERF-01) risks the documented <2s dashboard-load NFR on slower connections/devices.
- **Not assessed:** real viewport rendering, focus management, contrast, touch targets, screen-reader semantics on live pages — requires a running app + assistive tooling.

---

## 10. Remediation Plan

### Before Production (mandatory — all P1 blockers)
| Item | Owner role | Effort | Acceptance criteria | Verification |
|------|-----------|--------|---------------------|--------------|
| BLK-1 Webhook org scoping | Backend eng | S | Org B never receives Org A events | Tenant-isolation integration test |
| BLK-2 `listOrganizations` scope | Backend eng | XS | Manager sees only own org | Authz test |
| BLK-3 `Team.organization_id` + scope | Backend eng | M | Teams tenant-scoped; migration on repr. data | Cross-tenant read empty |
| BLK-4 `updateTeam` ownership | Backend eng | S | Cross-tenant update → 404/403 | Regression test |
| BLK-5 MFA in SSO | Backend eng | S | SSO honors `mfa_enabled` | Auth test |
| BLK-6 Drop migrate from postinstall | DevOps | XS | Install w/o DB succeeds | CI install job |
| BLK-7 Migration baseline + lock | DevOps | M | `migrate deploy` on empty + snapshot DB | Fresh-DB provisioning test |
| BLK-8 CI gates + block deploy | DevOps | M | Lint/test/typecheck/audit/smoke required; red blocks deploy | Failing PR blocked |
| BLK-9 Upgrade vuln deps | Full-stack | S | `npm audit --omit=dev` 0 high/critical both apps | CI audit gate |
| SEC-17 Rotate PAT | Operator | XS | New scoped/short-lived token; not on disk | `gh auth status` |

### First 7 Days After Release (safe to defer only if BLK-* closed)
SEC-06 (org mass-assign allowlist), SEC-07 (SSRF allowlist/private-range block), OPS-05 (real `/health`), OPS-06 (error tracking), FE-02 (SPA security headers), OPS-03 (dead cron).

### First 30 Days (P2 hardening)
SEC-08 (encrypt MFA/OAuth secrets), SEC-09 (CSRF), SEC-10 (CORS `*`+creds hard-fail), SEC-11 (refresh revocation + secret separation + alg pinning), SEC-12 (Slack replay), OPS-04 (job locking/idempotency), FE-01 (in-memory token), PERF-01 (code splitting), DATA-01 (audit retention), SEC-13 (org-create throttle). Add tenant-isolation integration test suite; wire Playwright e2e into CI; drill Neon restore + rollback.

### Longer-Term (P3)
FE-03, SEC-14/15/16, DATA-02, LOG-01, HYG-01..05, FE-04.

---

## 11. Production Release Gates

- [ ] All P1 blockers (BLK-1..9) closed with tests
- [ ] SEC-17 PAT rotated and removed from disk
- [ ] Tenant-isolation integration tests added and passing (webhook, org, team, cross-org refs)
- [ ] Authorization tests passing (per-role, direct-API bypass attempts)
- [ ] Clean production build (backend `tsc`, frontend `tsc -b && vite build`) — ✅ currently passing
- [ ] `npm audit --omit=dev` → 0 high/critical (both apps)
- [ ] CI runs lint + unit + typecheck + schema-drift + login-smoke + audit on PR/push, and blocks the Vercel production deploy on failure
- [ ] `migrate deploy` validated against empty **and** representative DB; `migration_lock.toml` committed; `postinstall` no longer migrates
- [ ] Neon backup restoration demonstrated end-to-end
- [ ] Deployment rollback (app + DB) demonstrated
- [ ] Production secrets provisioned + startup validation for required prod env vars
- [ ] Real integrations (Google/Taiga/Mattermost/Slack/Resend) tested against sandbox/live
- [ ] SPA security headers deployed; `/health` performs a DB check; error tracking + alerting live
- [ ] Critical-path e2e (login, timer start/stop/persist, reports export) passing in a production-like environment

---

## 12. Residual Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Review |
|------|-----------|--------|------------|-------|--------|
| Other tenant-isolation gaps beyond the 4 found | Medium | High | Add systematic tenant-isolation test matrix; audit every `where` lacking `organization_id` | Eng lead | Pre-release |
| Migration replay corrupts prod (db-push history) | Medium | High | Baseline + lock; test on snapshot; freeze `db push` in prod | DevOps | Pre-release |
| Integration outages/replay/duplicate events unhandled | Medium | Medium | Retries/backoff, replay windows, idempotency, reconciliation | Backend | 30 days |
| Serverless blind spots (no alerting) | High until OPS-06 | Medium | Sentry + uptime + log sink + alerts | SRE | 7 days |
| Dependency drift re-introduces CVEs | Medium | Medium | CI audit gate + Renovate/Dependabot | DevOps | Ongoing |
| Unverified backup/restore (RPO/RTO unmet) | Medium | High | Scheduled restore drills; document RTO/RPO evidence | SRE | 30 days |
| Bundle size misses <2s NFR on slow networks | Medium | Low/Med | Code-split; measure with real RUM | Frontend | 30 days |

---

*Prepared as an independent, evidence-based production-readiness audit. All build/test/audit results were produced by executing the stated commands in an isolated Linux sandbox against a clean install of the current `main` working tree; code findings were confirmed by direct source inspection. Items marked "not executed" were out of reach in this environment and must be closed with real evidence before the release decision is finalized.*
