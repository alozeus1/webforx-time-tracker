# Idle Timeout Admin Note

## What changed

Active timers now rely on both browser heartbeat updates and server-side stale-timer enforcement.

## Configuration

Backend environment variables:

- `IDLE_WARNING_MINUTES`: when the system should begin warning about inactivity.
- `HEARTBEAT_INTERVAL_MINUTES`: target cadence for browser heartbeat payloads.
- `HEARTBEAT_STALE_MINUTES`: when missing heartbeats are treated as stale.
- `AUTO_STOP_GRACE_MINUTES`: extra grace time after stale detection before server auto-stop.

Frontend environment variables:

- `VITE_HEARTBEAT_INTERVAL_MINUTES`
- `VITE_IDLE_WARNING_MINUTES`

## Runtime behavior

1. When a timer is active, the browser tracks the last meaningful user activity.
2. The browser sends heartbeats for the active timer with:
   - timer id
   - last activity timestamp
   - page visibility
   - focus state
3. The backend stores heartbeat metadata on `ActiveTimer`.
4. The idle tracker warns inactive users first, then auto-stops timers when heartbeat/activity is stale long enough.
5. Auto-stopped timers create a completed `TimeEntry`, store `stop_reason`, set `auto_stopped=true`, create a notification, and write an audit log entry.

## Auto-stop reasons

- `idle_timeout`: browser remained connected but no user activity was reported for too long.
- `heartbeat_missing`: heartbeats stopped arriving entirely.
- `browser_inactive`: browser was hidden or unfocused long enough to trigger server enforcement.

## Operational checks

- Verify `/api/v1/timers/ping` returns `200` while an active timer is running.
- Confirm recent audit logs show `timer_heartbeat_received`, `timer_idle_warning_issued`, and `timer_auto_stopped` when applicable.
- Confirm user notifications include `timer_auto_stopped` entries after an enforced stop.

