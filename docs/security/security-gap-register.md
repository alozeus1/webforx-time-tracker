# Security gap register

| ID | Control / evidence | Gap and severity | Fix / owner / status | Test, rollout risk and rollback |
| --- | --- | --- | --- | --- |
| SEC-01 | `frontend/src/services/api.ts` stores bearer and CSRF tokens in `localStorage` | XSS can exfiltrate bearer tokens; **High**, architecture-sensitive | Design cookie-only/short-lived migration with compatibility tests; security owner; Open | Session/auth E2E; rollout can invalidate sessions; feature-flag or revert client/server path |
| SEC-02 | Provider callbacks are public by design | Mattermost uses a shared callback token but lacks timestamped, signed replay evidence; **Medium residual** | Constant-time token comparison implemented for commands/dialogs; replay design still Open | `mattermostBotSecurity.test.ts`; no contract change; revert helper/controller comparison |
| SEC-03 | `/api-docs`, `/uploads`, token share routes are reachable without JWT | Public metadata/file exposure needs intended-access review; token shares now reject missing tenant scope; **Medium residual** | Review Swagger/static exposure and share TTL/revocation requirements; Open | `report.test.ts` legacy-token regression; revert focused route logic/test |
| SEC-04 | Router authentication and role gates are present | Handler-level organisation/object scope is not proven across all identifiers; **High pending evidence** | Expense update cross-org scope is now tested; trace remaining sensitive controllers; Open | `workforceFeatures.test.ts` BOLA regression plus additional cross-object tests; revert focused predicate change |
| SEC-05 | HSTS/CSP configured in source and Vercel config | Edge TLS, certificate, WAF, at-rest encryption, DB network controls not source-verifiable; **Medium operator evidence** | Operator verification checklist; Open | Read-only provider evidence; configuration rollback owned by operator |
| SEC-06 | Global/auth rate limiting exists | Route-specific quotas, idempotency and resource limits need evidence for reports, exports, timers, uploads and webhooks; **Medium** | Assess high-cost mutations; Open | Local integration/load-safe tests; staged report-only rollout if provider control |

Severity is provisional until handler and configuration evidence is complete. No
production-risk acceptance has been requested or granted.
