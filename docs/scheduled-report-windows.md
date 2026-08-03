# Scheduled Reports — Export Windows, Timezones & Validation Gates

Last updated: 2026-08-03

## Why this exists

Weekly reports were silently missing one full working day.

The old weekly window was computed from server-local time as:

```ts
const end   = startOfDay(addDays(now, 1));   // tomorrow 00:00, SERVER local
const start = addDays(end, -7);
```

Two compounding defects:

1. **Wrong boundaries.** Running on a Monday produced a **Tuesday → Monday** window, so the Monday that belonged to the working week fell outside it.
2. **Report ran before its window closed.** The cron fired at `59 23 * * *` UTC and generation landed at ~00:43 on the closing day, which therefore contributed roughly zero data.

Net effect: every weekly report captured six days, not seven. Monday 2026-07-27 appeared in neither the Week 30 (`2026-07-21 → 2026-07-27`) nor the Week 31 (`2026-07-28 → 2026-08-03`) export. Staff hours were understated by 6.6–9.4 hours each — one working day — and four staff were reported as failing the 40-hour minimum when they had in fact met it.

Because these reports drive warning ladders and termination decisions, the fix is paired with validation gates that **halt generation loudly** rather than emit a report that looks authoritative but is not.

## How the window works now

| Property | Value |
|---|---|
| Window start | Monday `00:00:00.000` in the reporting timezone |
| Window end | Sunday `23:59:59.999` in the reporting timezone |
| Span | Exactly 7 calendar days |
| Generation | Monday at `schedule_generation_time` (default `06:00`), same timezone |
| Coverage | The **previous complete week** — the generation day is never inside its own window |

Example, `America/Chicago`, generation Monday 2026-08-03 06:00 CDT:

```
window.start        = 2026-07-27T05:00:00.000Z   (Mon 00:00:00 CDT)
window.endExclusive = 2026-08-03T05:00:00.000Z   (Mon 00:00:00 CDT, next week)
window.end          = 2026-08-03T04:59:59.999Z   (Sun 23:59:59.999 CDT)
window.label        = "2026-07-27 to 2026-08-02"
```

Database queries use the half-open range `gte: start, lt: endExclusive`. This avoids the sub-millisecond gap that a `<= 23:59:59.999` comparison leaves open.

Implementation: `backend/src/utils/reportWindow.ts`. No new dependency — all timezone maths uses the platform `Intl` API.

## Timezone selection and its impact

`reporting_timezone` is an IANA identifier (for example `America/Chicago`, `Africa/Lagos`, `Pacific/Auckland`) stored per scheduled report. Everything is a wall-clock time in that zone: window boundaries, the generation slot, and the day-bucketing used by the zero-entry gate.

**Choosing the wrong zone shifts the window.** A team working in `Africa/Lagos` (UTC+1) configured as `UTC` gets a window running 01:00 Monday to 00:59 Monday-next in local terms — an hour of Monday morning falls into the previous week's report. Set the zone to where the team actually works, not where the server runs.

**Zone also decides when the report fires.** Monday 06:00 in `Pacific/Auckland` is Sunday 18:00 UTC; Monday 06:00 in `America/Los_Angeles` is Monday 13:00 UTC. This is why the scheduled-report cron ticks **hourly** (`/api/v1/cron/scheduled-reports`, `0 * * * *`) rather than once a day: a single daily tick at 23:59 UTC would never observe an Auckland report's Monday-morning slot, and that report would never send.

Exactly-once delivery is preserved by comparing `last_sent_at` against `window.endExclusive` rather than against a server-local "start of today". Once `last_sent_at` is at or after the window's exclusive end, that week has already been delivered, in whatever timezone the scheduler happened to tick.

### DST handling

Wall-clock times are stable across transitions; the UTC instant moves.

- **Spring forward** (US, Sunday 2026-03-08): the week `2026-03-02 → 2026-03-08` is still 7 calendar days but only **167 real hours**.
- **Fall back** (US, Sunday 2026-11-01): the week `2026-10-26 → 2026-11-01` is 7 calendar days and **169 real hours**.
- **Ambiguous times** (the repeated hour at fall-back) resolve to the **first** occurrence, so a job never runs twice.
- **Non-existent times** (the skipped hour at spring-forward) resolve to the instant the clock jumps to, so a job never silently vanishes.

Half-hour and 45-minute zones (`Asia/Kolkata` UTC+05:30, `Asia/Kathmandu` UTC+05:45) are supported and covered by tests.

## Why generation never runs on Sunday

Sunday `23:59:59` closes every export window. Generating on Sunday means generating *inside* the window it is meant to report on — precisely the defect above, where the report ran 43 minutes into its own final day.

Enforcement is layered:

- The API rejects `day_of_week = 0` for weekly reports with an explanatory 400.
- Weekly reports are pinned to Monday (`day_of_week` is normalised to `1`) regardless of what the caller sends.
- `isGenerationDue()` returns `false` unless the local weekday is Monday and the local time is at or past the configured slot.
- `findGenerationDayConflict()` flags any generation day that collides with the window's closing day.

The default `06:00` gives six hours after midnight for late entries and approvals to land before the week is read.

## Validation gates

Both gates run **before** any data is rendered. Neither short-circuits the other — an operator debugging a blocked report gets the complete picture in one pass rather than fixing one problem and hitting the next the following week.

### Gate 1 — Zero entry check

Every **required** day in the window must have at least one time entry across the organisation.

```
Report generation failed: 2026-07-27 contains zero entries across the organization. Cannot proceed.
```

Days are bucketed by the **reporting timezone's** calendar date, not UTC. An entry at `2026-07-28T02:00Z` is Monday 2026-07-27 21:00 in `America/Chicago` and counts toward Monday — bucketing in UTC would credit Tuesday and leave Monday looking empty.

`validation_gate_required_days` holds the weekday indices that must contain data (`0` = Sunday … `6` = Saturday), defaulting to all seven.

> **Operational trade-off.** The strict all-seven-days default catches a missing weekend day, which is exactly the class of gap that caused this incident. It will also block a report over a genuine company holiday or shutdown week. Narrow `validation_gate_required_days` (for example to `[1,2,3,4,5]`) for teams that legitimately do not log at weekends — **prefer this over disabling the gate entirely**, which also gives up window-integrity checking.

### Gate 2 — Window integrity check

The window must span exactly 7 calendar days and close on a Sunday.

```
Report generation failed: Export window integrity check failed. Expected 7 days ending Sunday, got 6 days.
Report generation failed: Export window integrity check failed. Expected 7 days ending Sunday, got window ends on Monday (2026-08-03).
```

Had this gate existed, it would have caught the original defect on its first run: the Week 31 window ended on a Monday.

### What happens on failure

1. Generation halts. **No report is sent.**
2. Both gate outcomes are logged with full structured context — per-day entry counts, window boundaries in local time and UTC, timezone, and day span.
3. An alert email goes to the report's recipients explaining which gate failed and why.
4. `last_sent_at` is **not** updated, so the report retries on the next tick once the data issue is resolved.
5. The run result counts the report as `blocked`, distinct from `failed`.

`blocked` returns HTTP **200** with `status: "validation_blocked"`, not 500. A blocked report is the gate working correctly; returning 500 would make the cron platform retry and send operators chasing a phantom infrastructure fault instead of the data problem.

## Configuration reference

| Field | Type | Default | Notes |
|---|---|---|---|
| `reporting_timezone` | IANA string | `UTC` | Validated on write; invalid values rejected with 400 |
| `export_window_start` | string | `monday 00:00:00` | Fixed; a differing value is rejected, not ignored |
| `export_window_end` | string | `sunday 23:59:59` | Fixed |
| `schedule_generation_time` | `HH:mm` | `06:00` | 24-hour, in `reporting_timezone` |
| `validation_gates_enabled` | boolean | `true` | Master switch |
| `validation_gate_zero_entries` | boolean | `true` | Gate 1 |
| `validation_gate_window_integrity` | boolean | `true` | Gate 2 |
| `validation_gate_required_days` | int[] | `[0,1,2,3,4,5,6]` | `0` = Sunday … `6` = Saturday |

### Valid configuration

```json
{
  "frequency": "weekly",
  "recipients": ["hr@webforxtech.com"],
  "report_type": "detailed",
  "reporting_timezone": "America/Chicago",
  "schedule_generation_time": "06:00",
  "validation_gates_enabled": true,
  "validation_gate_zero_entries": true,
  "validation_gate_window_integrity": true,
  "validation_gate_required_days": [1, 2, 3, 4, 5]
}
```

### Invalid configurations

| Configuration | Rejected because |
|---|---|
| `"day_of_week": 0` | Sunday closes the window; weekly reports run Monday |
| `"reporting_timezone": "CST"` | Not an IANA identifier — use `America/Chicago` |
| `"schedule_generation_time": "6:00"` | Must be zero-padded 24-hour `HH:mm` |
| `"schedule_generation_time": "24:00"` | Out of range |
| `"export_window_end": "saturday 23:59:59"` | Window boundaries are fixed |
| `"validation_gate_required_days": [7]` | Out of range — valid values are 0–6 |

## Troubleshooting

### "contains zero entries across the organization"

The named day genuinely has no entries for the whole organisation. Work through, in order:

1. **Is the timezone right?** A misconfigured zone shifts day boundaries and can empty a day that has data. Check `reporting_timezone` against where the team actually works.
2. **Was it a non-working day?** Public holiday, company shutdown, or a weekend for a team that does not log at weekends. If recurring, narrow `validation_gate_required_days` rather than disabling the gate.
3. **Is data ingestion broken?** Query the window directly:
   ```sql
   SELECT (start_time AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date AS local_day,
          COUNT(*) AS entries
   FROM "TimeEntry"
   WHERE organization_id = '<org-id>'
     AND start_time >= '<window.start ISO>'
     AND start_time <  '<window.endExclusive ISO>'
   GROUP BY 1 ORDER BY 1;
   ```
   A correct week returns 7 rows. A missing row is the offending day.
4. **Was the day approved but not logged?** Only entry existence is checked, not approval status — a day with entries in any status passes.

Once resolved, the report self-heals on the next hourly tick because `last_sent_at` was never advanced. To force an immediate run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://api.dev.webforxtech.com/api/v1/cron/scheduled-reports
```

### "Export window integrity check failed"

This should be unreachable through normal configuration — it indicates the window builder returned something malformed. Capture the logged `details` payload (day span, start/end local dates and weekdays, timezone) and treat it as a bug in `reportWindow.ts`, not a data problem.

### A report never sends

1. `is_active` must be `true`.
2. At least one valid recipient must be configured.
3. The hourly cron `/api/v1/cron/scheduled-reports` must be present in `backend/vercel.json` and `CRON_SECRET` set.
4. Check the local weekday: `isGenerationDue` only returns true on Monday at or after the slot in the **reporting** timezone.
5. Check `last_sent_at` — if it is at or after the current window's exclusive end, the week has already been delivered.

### Reports send twice

Should not occur: de-duplication compares `last_sent_at` against `window.endExclusive`, which is timezone-independent. If observed, verify `last_sent_at` is actually being persisted — a failing `scheduledReport.update` leaves the report eligible on the next tick.

## Migration and rollout

Migration `20260803000000_scheduled_report_window_and_gates` adds every column as `NOT NULL DEFAULT`, so existing rows backfill in place and no deploy ordering is required.

Existing reports adopt `reporting_timezone = 'UTC'`. **Set the correct zone per organisation after deploying** — UTC reproduces the previous behaviour on the timezone dimension, though the window boundaries are corrected regardless.

Rollout order:

1. Deploy backend (`prisma migrate deploy` runs via `npm run release:migrate`).
2. Confirm the hourly cron appears in the Vercel dashboard.
3. Update `reporting_timezone` on each scheduled report.
4. Verify the next Monday run: check the emailed window label spans Monday → Sunday.
5. Re-run historical weeks before relying on any warning-ladder position derived from the old series.

> **Backfill note.** Every weekly report generated before this fix is understated by roughly one working day. Warning-ladder positions and termination recommendations derived from Weeks 26–31 should be recomputed against corrected windows before any disciplinary action proceeds.

## Tests

- `backend/tests/reportWindow.test.ts` — window boundaries, UTC±12/13, half- and quarter-hour zones, DST spring/fall (167h and 169h weeks), month/year/leap-day boundaries, never-on-Sunday scheduling, ambiguous-hour resolution.
- `backend/tests/reportValidationGates.test.ts` — both gates, exact message formats, timezone-correct day bucketing, required-day subsets, disabled-gate behaviour.
- `backend/tests/scheduledReportDelivery.test.ts` — end-to-end delivery, the regression assertion that the window is Monday→Sunday and excludes the generation day, gate blocking with admin alert, per-timezone due-ness, and exactly-once delivery.
