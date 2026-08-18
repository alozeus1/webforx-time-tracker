# Threat model

## Assets and actors

Restricted assets include credentials, session tokens, integration configuration,
employee/time/payroll/expense/report data, audit records, signed upload access,
and outbound-webhook secrets. Actors include anonymous internet users, ordinary
members, managers, administrators, automated bots, cron/service identities,
third-party callbacks, compromised accounts, and malicious dependencies.

## Key trust boundaries and abuse cases

| Boundary | Principal threat | Current mitigation / validation needed |
| --- | --- | --- |
| Browser → API | Token theft, CSRF, CORS abuse, BOLA | JWT, CSRF for cookies, CORS; assess bearer token browser storage and per-object predicates |
| API → database | Cross-organisation reads/writes, injection | Prisma; trace controller predicates and tenant tests |
| Provider callback → API | Forgery, replay, body parsing mismatch | Slack raw-body HMAC plus strict five-minute timestamp; Mattermost static token needs replay-design decision; Teams is non-mutating |
| Cron → API | Unauthorised destructive/report triggers | Required production shared secret; assess constant-time comparison and endpoint scope |
| API → external URLs/storage | SSRF, credential disclosure, unsafe redirect/upload | outbound URL validator and signed receipt paths; test private-address/redirect behaviour |
| CI/deploy → runtime | secret exposure, dependency compromise, unsafe deploy | pinned actions, audits, scans; provider configuration needs operator evidence |

## Initial risk priorities

1. Confirm object/organisation scope for timer, report, expense, payroll, share,
   receipt and admin object identifiers (High if any predicate is missing).
2. Mattermost uses a static shared token, not a signed timestamped callback;
   preserve the current integration but design replay protection before relying
   on it for high-impact actions (Medium residual).
3. Reduce bearer-token exposure in browser storage through a compatibility-safe
   design; do not change active authentication flow without a tested migration.
4. Review public documentation/static/upload/share surfaces for metadata or
   access-control leakage.

## Compatibility-sensitive upload observation

Project logo uploads are client-limited to 2 MB and include SVG in the advertised
format list; the API's global JSON ceiling is 10 MB and local deployment can
serve persisted logos from `/uploads`. Restricting SVG or tightening the server
limit changes an existing admin workflow. Treat it as a reviewed medium-risk
compatibility decision requiring a preview test and explicit rollout plan, not a
silent hardening change.

No finding is marked remediated until a reproducible automated test or provider
configuration evidence is recorded.
