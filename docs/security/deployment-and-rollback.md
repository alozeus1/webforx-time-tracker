# Security deployment and rollback

This branch is **not authorised for deployment**. Any later production promotion
requires explicit human approval after preview/staging verification.

1. Deploy the branch to an isolated preview with non-production database, scoped
   credentials and no live email/webhook recipients.
2. Run the affected route, role/tenant, session, header and callback tests plus
   authenticated DAST only against that preview.
3. Promote to staging and observe login failures, timer-event loss/duplication,
   unexpected `401/403/429/5xx`, report failures, webhook failures, CSP violations
   and latency before considering production.
4. For CSP, WAF, rate limits or auth changes, use report-only, flag or canary
   control. Do not delete compatibility paths until the agreed rollback window ends.

Rollback is a redeploy of the prior immutable application version plus disabling
the new feature flag/report-only policy. Database, secret, DNS, certificate and
provider changes require their own separately approved rollback runbook.
