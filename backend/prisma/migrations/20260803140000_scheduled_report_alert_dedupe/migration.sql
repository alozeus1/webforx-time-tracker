-- Per-window de-duplication marker for validation-gate alerts.
--
-- The scheduled-report endpoint is polled hourly (GitHub Actions; Vercel Hobby
-- rejects sub-daily cron expressions). A report blocked by a validation gate stays
-- due for the remainder of its generation day and never advances last_sent_at, so
-- without a marker a single missing day of data produced roughly one identical
-- alert email per hour to every admin.
--
-- Stores the START of the window that was last alerted about rather than a
-- timestamp, so the comparison is exact: a new blocked window has a different start
-- and alerts once, while repeated ticks on the same window stay silent.
--
-- Nullable with no default: existing rows correctly represent "never alerted".

ALTER TABLE "ScheduledReport"
  ADD COLUMN IF NOT EXISTS "last_validation_alert_window" TIMESTAMP(3);
