# Security test plan

| Control | Automated evidence | Manual / environment evidence |
| --- | --- | --- |
| Build integrity | `bash scripts/gauntlet.sh`, audit guard, desktop validation | CI job results on branch/PR |
| Authentication/session/CSRF | backend auth, cookie and CSRF tests; frontend session tests | Preview login/logout/refresh only |
| Role and tenant isolation | existing admin/team/organisation/webhook tests plus new cross-object tests | Two test organisations in preview |
| Public callbacks | New forged, stale and replay callback tests | Provider test workspace only |
| Input/output and SSRF | existing outbound URL tests plus route schemas | Preview-only abuse probes |
| Browser headers/CORS | CSP and API tests | Preview header inspection; edge configuration evidence |
| Reports/files/webhooks | New ownership and signed URL tests | Non-production storage and recipients only |
| Dependencies/secrets | audit guard, CI secret scan, CodeQL | Approved history scan only if authorised |

Expected negative outcomes are safe `401`, `403`, `404`, `409`, or `429` without
resource existence or sensitive data leakage.
