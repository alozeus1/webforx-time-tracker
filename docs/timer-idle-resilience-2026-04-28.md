# Timer Idle Resilience Update

Date: 2026-04-28

## Summary

This update makes timer idle handling more resilient without removing existing safeguards.
The timer still starts, pauses, resumes, stops, and expires through the existing server-backed `ActiveTimer` flow.
Idle timeout remains enabled, and the 8-hour maximum active session duration remains enforced.

## Behavior

- One missed heartbeat does not pause or stop the timer.
- Repeated missed heartbeats can warn first, then pause according to policy.
- Idle timeout pauses the active timer instead of creating an automatic stopped time entry.
- Paused duration is excluded from worked time.
- Resume updates paused duration and does not backfill the paused gap.
- Max active duration still uses enforced stop/expiry.
- Max pause duration still prevents abandoned paused timers from staying open forever.

## Correction Workflow

Users can submit correction requests for missed time when the timer paused while they were genuinely working.
Requests include a start time, end time, reason, and optional work note.
Requests remain pending until manager/admin review.
Approval creates a separate approved manual adjustment entry; it does not mutate old timer data.
Rejected requests remain visible and auditable.

## Admin Policy

Admins can configure global timer policy:

- heartbeat interval seconds
- missed heartbeat warning threshold
- missed heartbeat pause threshold
- idle warning minutes
- idle pause minutes
- max session duration hours
- resume after idle pause
- resume note threshold

Server validation prevents unsafe values, disabled idle timeout, disabled max duration, or unlimited timers.

## Audit Events

The implementation uses existing `AuditLog` records for:

- timer start/stop/pause/resume
- heartbeat receipt
- idle warning
- correction request create/approve/reject
- timer policy update

Audit metadata stays non-invasive.

## Privacy Guardrails

No invasive monitoring was added.
The system does not capture keystrokes, screenshots, clipboard contents, filenames, IDE contents, browser page contents, or screen activity.

## Migration

Migration: `backend/prisma/migrations/20260428000000_timer_idle_resilience/migration.sql`

The migration is additive:

- adds pause/heartbeat metadata fields to `ActiveTimer`
- adds `TimerCorrectionRequest`
- adds `TimerPolicyConfig`

No existing timer or time entry data is dropped or renamed.

## Known Limitations

- Local migration application could not be verified in this session because PostgreSQL at `localhost:5432` was not reachable.
- The admin policy UI is global only. Role/team policy scope is modeled but not exposed yet.
- Correction approvals create projectless approved adjustment entries. A later iteration can add project selection if business reporting requires project attribution.

## Phase 3 Recommendation

Future Phase 3 can add an optional desktop companion agent for safe machine-level active/idle/locked status.
It was not implemented in this phase.
It must not capture keystrokes, screenshots, clipboard data, file contents, or sensitive app details.
