# Idle Timeout Admin Note

## What changed

Active timers now rely on browser heartbeat updates, server-side stale-timer enforcement, and a controlled idle pause flow.
Idle timeout remains enabled, but normal idle/heartbeat enforcement pauses timers instead of hard-stopping them.
The 8-hour maximum active session duration still creates an enforced stop.

## Configuration

Backend environment variables:

- `IDLE_WARNING_MINUTES`: when the system should begin warning about inactivity.
- `HEARTBEAT_INTERVAL_MINUTES`: target cadence for browser heartbeat payloads.
- `HEARTBEAT_STALE_MINUTES`: when missing heartbeats are treated as stale.
- `AUTO_STOP_GRACE_MINUTES`: extra grace time after stale detection before server auto-stop.
- `MISSED_HEARTBEAT_WARNING_THRESHOLD`: optional fallback threshold for warning on missed heartbeats.
- `MISSED_HEARTBEAT_PAUSE_THRESHOLD`: optional fallback threshold for pausing on missed heartbeats.

Frontend environment variables:

- `VITE_HEARTBEAT_INTERVAL_MINUTES`
- `VITE_IDLE_WARNING_MINUTES`

Admin policy:

- Admins can view and update global timer policy from the Admin policy tab.
- Server validation prevents disabled/unlimited timers.
- `maxSessionDurationHours` cannot exceed the existing 8-hour limit.
- `idlePauseAfterMinutes` must remain between 5 and 60 minutes.
- Regular users cannot access or update timer policy.

## Runtime behavior

1. When a timer is active, the browser tracks the last meaningful user activity.
2. The browser sends heartbeats for the active timer with:
   - timer id
   - last activity timestamp
   - page visibility
   - focus state
3. The backend stores heartbeat metadata on `ActiveTimer`.
4. The idle tracker warns inactive users first, then pauses timers when heartbeat/activity is stale long enough.
5. Idle-paused timers keep the active timer record, set pause metadata, stop accumulating worked time, create a notification, and write an audit log entry.
6. Users can resume the paused timer. The paused gap is added to `paused_duration_seconds` and is not counted as worked time.
7. If the user worked during the paused gap, they can submit a correction request for manager/admin review.

## Auto-stop reasons

- `idle_timeout`: no user activity was reported for long enough to pause the timer.
- `missed_heartbeat_threshold`: enough heartbeat intervals were missed to pause the timer.
- `browser_inactive`: browser was hidden or unfocused long enough to trigger server enforcement.
- `active_duration_limit`: active timer reached the maximum session duration and was stopped.
- `pause_expired`: paused timer exceeded the maximum allowed pause duration and was stopped.

## Operational checks

- Verify `/api/v1/timers/ping` returns `200` while an active timer is running.
- Confirm recent audit logs show `timer_heartbeat_received`, `timer_idle_warning_issued`, `timer_paused`, `timer_resumed`, and correction request events when applicable.
- Confirm user notifications include `timer_paused` after idle pause and correction review notifications after admin action.
- Confirm `timer_auto_stopped` is reserved for max duration and pause-expiry enforcement.

## Correction Requests

Users can submit correction requests with requested start/end time, reason, and optional work note.
Requests default to `PENDING`.
Admins/managers can approve or reject requests with a reviewer note.
Approvals create a separate approved manual adjustment entry; they do not mutate old timer records.
Rejected requests remain stored and visible for audit/reporting history.

## Privacy Guardrails

The heartbeat flow stores only safe timer metadata:

- heartbeat receipt time
- optional last client activity timestamp
- page visibility/focus state
- missed heartbeat counts

It does not capture keystrokes, screenshots, clipboard contents, filenames, IDE contents, browser page contents, or screen activity.

## Rollback Notes

Rollback code by redeploying the previous backend and frontend versions.
The migration is additive: new nullable/default timer fields plus `TimerCorrectionRequest` and `TimerPolicyConfig` tables.
If a database rollback is required, restore from the pre-deploy Neon branch/snapshot rather than dropping tables manually in production.

## Future Phase 3

An optional desktop companion agent may later report safe machine-level active/idle/locked status.
That agent was not implemented in this phase and must not capture keystrokes, screenshots, clipboard data, file contents, or sensitive app details.
