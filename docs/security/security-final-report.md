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
