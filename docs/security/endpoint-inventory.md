# Endpoint inventory

**Baseline source:** route mounts in `backend/src/index.ts` and declarations in
`backend/src/routes/*.ts` at `d0b3828b`. This is an implementation inventory;
handler-level data classification and object-scoping review is tracked in the gap
register.

| Route family | Methods / route patterns | Classification | Server gate / notable purpose |
| --- | --- | --- | --- |
| `/health`, `/ready`, `/api/v1` | GET | health/internal discovery | Public liveness/readiness and API descriptor; no sensitive data intended |
| `/api-docs` | GET | documentation | Public Swagger UI; exposure review open |
| `/api/v1/auth` | login, Google, logout, reset, policy, CSRF, refresh, MFA | public + authenticated | Auth limiter; protected MFA status/setup/verify/disable use JWT |
| `/api/v1/public`, `/contact`, `/organizations` | share token, request access, organisation signup | public | Share token or input limiter; signup is intentionally self-service |
| `/api/v1/users`, `/projects`, `/tags` | CRUD, profiles, roles, imports | authenticated / privileged | JWT; manager/admin and admin gates per route |
| `/api/v1/timers` | timer lifecycle, heartbeat, entries, corrections, approvals | authenticated / privileged | JWT router gate except `pause-beacon`, which validates its submitted token in-controller |
| `/api/v1/reports`, `/scheduled-reports`, `/invoices`, `/payroll` | reporting, schedules, billing periods | authenticated / privileged | JWT router gate; manager/admin controls for sensitive functions |
| `/api/v1/admin`, `/branding`, `/geofences`, `/schedules`, `/templates` | policy, audit, teams, branding, geofence, schedule/template administration | authenticated / privileged | JWT and role gates; public branding is separate and intentional |
| `/api/v1/expenses`, `/leave`, `/calendar`, `/ml` | employee data, receipts, leave, calendar, categorisation | authenticated / privileged | JWT router gate; calendar callback is external/OAuth return |
| `/api/v1/integrations`, `/webhooks` | integrations, outbound webhook administration | authenticated / privileged | JWT; webhooks/admin writes restricted to Admin |
| `/api/v1/bots` | Slack/Mattermost/Teams callbacks and admin configuration | webhook + authenticated | Slack HMAC/raw body, Mattermost-specific verification/state, admin config JWT + Admin |
| `/api/v1/cron` | sweep, daily/scheduled reports, retention, demo reset | service-to-service | Constant shared-secret comparison; production fails closed when absent |
| `/uploads` | static files | internal/public exposure review | Static upload directory; access-control and listing behaviour require handler/storage review |

## Inventory coverage and next evidence

The source route declaration list is reproducible with:

```bash
rg -n --glob 'backend/src/routes/*.ts' 'router\.(get|post|put|patch|delete|use)\(' backend/src/routes
```

Phase 1 expands each route into handler, request/response schema, size limit,
data objects, ownership predicate, rate/replay behaviour, audit expectation and
test reference. Unknowns remain explicitly open rather than inferred from UI.
