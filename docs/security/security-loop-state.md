# Security loop state

- Baseline commit: `d0b3828b6f0aaf05a93cc4560dbc5ce3320bd9bb`
- Branch: `security/zero-trust-endpoint-hardening`
- Recorded: 2026-08-18
- Phase: 1 inventory/control iteration in progress; Phase 0 baseline complete.
- Completed: branch created; unrelated untracked SES artifacts preserved; source
  architecture, route mounts, auth/CSRF/cookie/security-header controls, CI gates,
  and test inventory inspected.
- Reusable evidence: `rg` route inventory from `backend/src/routes/*.ts`; release
  gates are `scripts/gauntlet.sh` and `.github/workflows/release-guards.yml`.
- Baseline validation: `bash scripts/gauntlet.sh` passed (backend 42/437;
  frontend 25/125); desktop validation passed (5/5); all three audit guards
  passed. Backend Jest emitted its known post-pass open-handle warning. Database
  replay and browser E2E remain pending isolated prerequisites.
- Open risks: SEC-01 browser bearer token storage; SEC-02 external callback
  verification/replay; SEC-03 public documentation/static/share surface; SEC-04
  handler-level tenant/object predicates; SEC-05 operator-only edge controls;
  SEC-06 costly-route quotas/idempotency.
- Iteration 1: Mattermost callback token comparisons now use a shared
  constant-time helper. Targeted test and backend typecheck passed; replay
  resistance remains open because current callback data lacks timestamp/nonce
  evidence.
- Iteration 2: expense update cross-organisation BOLA test passed; it asserts a
  tenant-scoped lookup, `404`, and no mutation. Other object routes remain open.
- Iteration 3: public share tokens without tenant scope now have a fail-closed
  regression test. Full non-database gauntlet passed (backend 43/440;
  frontend 25/125); expected prerequisites still block migration replay/E2E.
- Iteration 4: Slack callback timestamps now require a strict safe integer
  before five-minute HMAC verification. Targeted tests (3) and backend typecheck
  passed. Mattermost replay remains a design-level residual risk.
- Iteration 5: generic audit middleware now persists field names only, with a
  payload-redaction regression test and passing backend typecheck. It is not
  currently mounted; direct audit event metadata remains separately reviewed.
- Iteration 6: project update cross-organisation BOLA test passed (`404`,
  scoped lookup, no mutation). Full non-database gauntlet passed (backend
  45/445; frontend 25/125). Project-logo format/size/static policy is open.
- Changed paths since baseline: `docs/security/*`,
  `backend/src/controllers/mattermostBotController.ts`, and
  `backend/tests/mattermostBotSecurity.test.ts`.
- Next actions:
  1. Commit project BOLA evidence and Phase 1 observations.
  2. Complete detailed route inventory and object-scope evidence.
  3. Design preview-safe project-logo upload policy with rollback.
