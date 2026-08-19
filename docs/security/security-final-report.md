# Security final report

Status: **In progress — not approved for deployment.**

This document is updated after each completed control iteration with implemented
changes, test evidence, deferred items, provider prerequisites and an explicit
human-review recommendation. It must not contain credentials, production data,
or sensitive runtime topology.

## Iteration 1 — Mattermost callback token comparison

- Finding: command and dialog callback credentials used ordinary string equality.
- Change: added a length-checked `crypto.timingSafeEqual` helper and applied it
  to both paths. Token format and responses remain unchanged.
- Evidence: targeted Jest test passed; backend test typecheck passed.
- Residual risk: this cannot provide replay resistance because the current
  callback contract supplies no signed timestamp/nonce evidence. No deployment
  has occurred.

## Iteration 2 — Expense object isolation regression

- Finding: expense updates are a restricted cross-organisation object boundary.
- Change: added a negative integration-style route test for a caller from a
  different organisation.
- Evidence: `workforceFeatures.test.ts` passed (7 tests); backend typecheck
  passed. The test proves `404`, tenant-scoped lookup and no update.
- Residual risk: other sensitive object routes still require the same review.

## Iteration 3 — Public share tenant-scope regression

- Finding: public share tokens must not retrieve artifacts without tenant scope.
- Change: added a legacy-token test asserting generic `404` before any data
  query. No public API response or token format changed.
- Evidence: targeted report test passed (10 tests); full non-database gauntlet
  passed (backend 43/440; frontend 25/125).
- Residual risk: public Swagger/static uploads and token revocation policy still
  require compatibility review.

## Iteration 4 — Slack callback timestamp validation

- Finding: the Slack signature helper accepted non-numeric timestamp text until
  HMAC comparison, rather than rejecting malformed metadata directly.
- Change: added strict numeric/safe-integer validation before stale-window and
  HMAC checks, with valid, malformed, stale and invalid-signature tests.
- Evidence: `slackBotSecurity.test.ts` passed (3 tests); backend typecheck
  passed.
- Residual risk: Slack's five-minute signed window is not a durable replay
  ledger; Mattermost lacks timestamped callback metadata.

## Iteration 5 — Audit payload minimisation

- Finding: the generic audit middleware would persist entire non-GET request
  bodies and query values if used.
- Change: it now stores only bounded query/body field names. Route-specific
  audit events remain responsible for deliberately curated metadata.
- Evidence: `auditMiddleware.test.ts` passed; backend typecheck passed.
- Residual risk: existing direct error logging and every future route-specific
  audit payload still need review; this middleware is not currently mounted.

## Iteration 6 — Project object isolation regression

- Finding: project mutation is a high-value cross-organisation object boundary.
- Change: added a negative route test for a different-organisation admin.
- Evidence: `project.test.ts` passed (11 tests); full non-database gauntlet
  passed (backend 45/445; frontend 25/125).
- Residual risk: the project-logo size/SVG/static-serving policy needs an
  explicit compatibility decision before enforcement.

## Final branch verification — SHA `0258514`

- Canonical non-database gauntlet: `bash scripts/gauntlet.sh`, run from
  2026-08-18T15:05:37Z to 2026-08-18T15:07:17Z, exited `0`. Backend: 45 Jest
  suites / 447 tests; frontend: 25 Vitest files / 125 tests. Formatting, lint,
  type-check, production builds, and cron checks passed.
- Final supplementary gates, run at SHA `025851401687ff453efaf9d08ca28f33ec8a843c`
  from 2026-08-18T15:10:29Z to 2026-08-18T15:10:34Z: desktop validation
  passed (5 tests); production audit guards passed for `desktop`, `backend`,
  and `frontend` (0 advisories each); repository secret-pattern scan passed.
- Warning: Jest retained its unchanged post-pass worker teardown warning; no
  assertion failure or security-test omission was observed.
- Deferred gates: migration replay needs an isolated database and Playwright
  needs the local preview stack. They are preview/merge gates, not blockers to
  pushing this default-off branch for review.
- Readiness: branch review **ready**; preview deployment requires the deferred
  preview checks; strict-logo activation is **not ready** until aggregate logo
  metadata and the documented preview plan succeed; production deployment is
  **not authorized**.
