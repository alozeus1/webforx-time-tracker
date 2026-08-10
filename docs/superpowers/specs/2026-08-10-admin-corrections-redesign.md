# Admin Corrections Tab Redesign

## Context

The **Organization Management → Corrections** tab (`/admin?tab=corrections`) currently loads every `TimerCorrectionRequest` in the organization (up to 200 rows) and defaults the status filter to **All**. With 113 approved/rejected corrections accumulated, the table is too long and pushes actionable pending items below the fold.

The page must remain safe to deploy while the app is in active production use.

## Goals

1. Default the corrections view to items that need admin action (**Pending**).
2. Keep resolved corrections (Approved / Rejected / Cancelled) available for ~30 days, then make them deletable.
3. Improve the UI/UX so the page is scannable and not dominated by historical rows.
4. Preserve the existing search + status filters; use them to pull up historical data when needed.
5. Do not break existing API consumers or the review workflow.

## Approaches Considered

### A. Frontend-only filter change
- Change the default `correctionStatus` state from `all` to `PENDING`.
- Pros: Zero backend change, smallest blast radius.
- Cons: Still ships all 113+ resolved rows to the browser on every load; does not address the 1-month retention requirement.

### B. Backend query filtering + frontend segmented tabs + manual purge
- `GET /timers/corrections/review` accepts `status` and `lookbackDays` query params.
- Frontend uses segmented tabs: **Pending** (default), **Resolved** (last 30 days), **All**.
- Add admin-only purge endpoint for resolved corrections older than the retention window.
- Pros: Solves performance/UI clutter, gives admins control, explicit about what is deleted.
- Cons: Slightly more code than option A.

### C. Soft-delete + automatic cron-only cleanup
- Add `deleted_at` to `TimerCorrectionRequest`, soft-delete resolved rows after 30 days via cron.
- Pros: Rows are recoverable.
- Cons: Schema migration required; adds a column never used for recovery; over-engineered for an operational log. The user asked that records be deletable after 30 days, not recoverable.

## Recommended Approach: B

Backend query filtering plus frontend segmented tabs plus an admin purge action. This keeps the default view fast, satisfies the 30-day retention policy, and avoids a schema migration.

---

## Backend Design

### 1. Env configuration

Add to `backend/src/config/env.ts`:

```ts
correctionRetentionDays: (() => {
    const parsed = Number.parseInt(process.env.CORRECTION_RETENTION_DAYS?.trim() || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
})(),
```

No production deployment blockers — it has a safe default.

### 2. `GET /timers/corrections/review`

Accept query params:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | single status or comma-separated list (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `all`) | `all` (backward compatible) | Filter by status |
| `lookbackDays` | number | `undefined` | Only return rows with `created_at >= now() - lookbackDays` |
| `limit` | number | `200` | Max rows |
| `offset` | number | `0` | Pagination offset |

Behavior:
- When `status` includes resolved states (`APPROVED`, `REJECTED`, `CANCELLED`, `all`), apply `lookbackDays` if provided.
- When `status` is `PENDING` or unspecified, pending rows are always returned regardless of age.
- Existing clients (no query params) continue to receive the same shape: `{ corrections: [...] }`.

### 3. New purge endpoint

`POST /timers/corrections/purge-resolved` (Manager/Admin only).

Deletes `TimerCorrectionRequest` rows where:
- `status IN ['APPROVED', 'REJECTED', 'CANCELLED']`
- `reviewed_at < now() - CORRECTION_RETENTION_DAYS`

Returns:
```json
{ "deleted": 42 }
```

Uses batched deletion matching the pattern in `retentionService.ts` so a large backlog cannot time out a serverless function.

### 4. Cron cleanup (optional but recommended)

Add `POST /api/v1/cron/correction-retention` (protected by `CRON_SECRET`).
It calls the same purge logic so old resolved corrections are removed automatically without relying on an admin clicking the button.

Vercel Hobby plan note: sub-daily cron expressions are rejected. The cron will be scheduled daily (`0 4 * * *`).

### 5. Service module

Create `backend/src/services/correctionRetentionService.ts` to own:
- `getCorrectionRequestsForReview({ organizationId, status, lookbackDays, limit, offset })`
- `purgeResolvedCorrections(organizationId, retentionDays)`

This isolates the Prisma queries from the controller and makes unit testing straightforward.

---

## Frontend Design

### 1. Default state

On first load of the Corrections tab:
- Active segment: **Pending**
- API call: `GET /timers/corrections/review?status=PENDING`

This guarantees admins see only actionable items first.

### 2. Segmented tabs

Replace the single status `<select>` default with three segments:

- **Pending** — all pending requests (no age limit)
- **Resolved** — approved/rejected/cancelled from the last 30 days; shows a subtle caption like "Last 30 days"
- **All** — existing behavior (all statuses, all ages); search + status filter still work here

The existing status `<select>` remains visible when **All** is selected so the current filters are not removed.

### 3. Corrections list UI

Replace the dense 7-column table with a cleaner layout:

- Each correction is a card (or compact table row) containing:
  - User avatar + name/email
  - Status badge (Pending / Approved / Rejected / Cancelled)
  - Requested window + duration
  - Reason (truncated, expandable)
  - For resolved items: reviewer note + reviewed date
  - For pending: Approve / Reject buttons
- Use the existing `formatDurationHM` helper for duration formatting.
- Empty states tailored to the active segment:
  - Pending: "No pending corrections — you're all caught up."
  - Resolved: "No resolved corrections in the last 30 days."
  - All: existing "No correction requests found."

### 4. Purge action

In the **Resolved** segment header, add a secondary button:

> "Purge resolved older than 30 days"

- Disabled when there are 0 resolved rows older than the retention window, or after a successful purge.
- Requires confirmation: "This will permanently delete resolved corrections older than 30 days. Continue?"
- After confirmation, calls `POST /timers/corrections/purge-resolved` and refreshes the list.

### 5. CSV export

Keep the **Export CSV** button but make it export the currently visible segment + filters.

---

## Data Flow

1. Admin opens `/admin?tab=corrections`.
2. Frontend sets segment to **Pending** and fetches `?status=PENDING`.
3. Admin reviews/approves/rejects pending items; list refreshes.
4. Admin switches to **Resolved** to audit recent decisions; fetches `?status=APPROVED,REJECTED,CANCELLED&lookbackDays=30`.
5. Admin clicks **Purge**; backend hard-deletes resolved rows older than 30 days; list refreshes.
6. Nightly cron also purges old resolved rows automatically.

---

## Testing Plan

### Backend
- Unit tests for `correctionRetentionService.ts`:
  - Pending rows are always returned regardless of age.
  - Resolved rows are filtered by `lookbackDays`.
  - Purge only deletes resolved rows older than retention window.
- Route tests in `backend/tests/timeEntry.test.ts` (or new `correctionRetention.test.ts`):
  - `GET /timers/corrections/review?status=PENDING` returns only pending.
  - `POST /timers/corrections/purge-resolved` rejects non-admin/non-manager.
  - Cron endpoint rejects missing `CRON_SECRET`.

### Frontend
- Playwright e2e in `frontend/tests/admin-corrections.spec.ts`:
  - Default tab shows Pending corrections.
  - Switching to Resolved shows only last-30-day rows.
  - Search filters work in All segment.
  - Approve/Reject still update the status.
  - Purge flow shows confirmation and removes old resolved rows.

### Production safety
- No schema migration required.
- Existing API shape unchanged for clients that omit query params.
- Purge is limited to resolved corrections and only after the retention window.
- Cron is opt-in via `vercel.json`; manual purge button works independently.

---

## Deployment Notes

1. Deploy backend first (adds new endpoint + query params).
2. Deploy frontend second (new UI depends on new query params; graceful degradation if backend not yet deployed because old endpoint still works).
3. Optional: schedule the `correction-retention` cron in `backend/vercel.json`.
4. No env changes are required for default behavior; set `CORRECTION_RETENTION_DAYS` if a window other than 30 days is desired.

---

## Out of Scope

- Changing the employee-facing correction request flow (`/timers/corrections`).
- Adding a `deleted_at` soft-delete column; hard delete is acceptable for resolved operational requests.
- Archiving/exporting corrections before deletion (the existing CSV export satisfies ad-hoc record keeping).
