# Production Fix Design Note - 2026-04-09

## Scope

Fix three production-impacting issues while preserving the current email/password JWT login flow, role guards, timer business rules, and existing user routes.

## Issue 1 - Invalid/expired token leaves UI half-authenticated

Root cause hypothesis:
- Backend returns `403 Invalid or expired token` from JWT middleware, while the frontend refresh/logout interceptor only treats `401` as an auth failure.
- Auth cleanup is duplicated inline in the Axios interceptor and does not emit a single app-wide session-expired signal.
- Components continue protected API calls because stale localStorage state can survive until a hard navigation happens.

Planned fix:
- Return structured `401` auth errors for missing/invalid tokens from backend auth middleware.
- Add a centralized frontend auth-failure module that clears session state, stores a friendly message, emits a browser event, and redirects to login.
- Update Axios request/response interceptors to use refresh tokens once, stop queued protected requests after hard failure, and reject further protected calls while logout is in progress.
- Let existing data-loading components finish gracefully by ensuring failed calls reject and clear loading states.

## Issue 2 - Notifications cannot transition read/delete state

Root cause hypothesis:
- Notification persistence only has `is_read`; there is no durable `read_at` or `deleted_at`.
- Backend exposes notification list endpoints but no read/detail/delete mutation endpoints.
- Bell UI displays items but never marks them read, never opens a durable detail state, and cannot delete them.

Planned fix:
- Extend `Notification` with `read_at` and `deleted_at`, keeping `is_read` for backward compatibility.
- Add user notification routes to list active notifications, fetch/open details, mark read, and soft-delete.
- Filter deleted notifications out of active lists.
- Update the bell to group unread/read, open notification details, mark opened notifications read, decrement unread count, and delete active items.

## Issue 3 - Active timers can run forever when users disappear

Root cause hypothesis:
- Current heartbeat pings every minute and only updates `last_active_ping`.
- Worker only creates idle warning notifications after 15 minutes; it never server-stops stale timers.
- Server does not record client activity, focus/visibility state, heartbeat metadata, or an auto-stop reason.

Planned fix:
- Add configurable backend thresholds for heartbeat interval, stale heartbeat, idle warning, and auto-stop behavior.
- Extend active timer heartbeat persistence with `last_heartbeat_at`, `last_client_activity_at`, visibility/focus fields, and metadata.
- Accept richer heartbeat payloads at `/timers/ping`.
- Implement server-side stale timer enforcement in the existing idle tracker: warn first, then create a completed `TimeEntry`, delete the `ActiveTimer`, record audit metadata, and notify the user with a reason.
- Update frontend heartbeat hook to track meaningful activity and send periodic 15-minute heartbeats while an active timer exists.

## Tests

Planned coverage:
- Backend auth middleware for expired/invalid token response semantics.
- Backend notification list/read/detail/delete lifecycle.
- Backend timer heartbeat payload persistence and stale auto-stop worker behavior.
- Frontend auth-failure utility/interceptor behavior.
- Frontend notification bell lifecycle.
- Frontend heartbeat hook payload and interval behavior.

