-- Scheduled report export window + validation gates
--
-- Context: the weekly export window was previously derived from server-local time as
-- [now-6d 00:00, now+1d 00:00), which produced a Tuesday-to-Monday window and dropped a
-- full working day from every weekly report. These columns make the window explicit,
-- timezone-aware, and validated before generation.
--
-- Backfill safety: every column is NOT NULL with a DEFAULT, so existing rows are
-- populated in place and no application deploy ordering is required. Existing reports
-- adopt UTC, which reproduces prior behaviour for the timezone dimension while still
-- gaining the corrected Monday-to-Sunday boundaries. Operators should set
-- reporting_timezone per organisation after deploy.

ALTER TABLE "ScheduledReport"
  ADD COLUMN IF NOT EXISTS "reporting_timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "export_window_start" TEXT NOT NULL DEFAULT 'monday 00:00:00',
  ADD COLUMN IF NOT EXISTS "export_window_end" TEXT NOT NULL DEFAULT 'sunday 23:59:59',
  ADD COLUMN IF NOT EXISTS "schedule_generation_time" TEXT NOT NULL DEFAULT '06:00',
  ADD COLUMN IF NOT EXISTS "validation_gates_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "validation_gate_zero_entries" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "validation_gate_window_integrity" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "validation_gate_required_days" JSONB NOT NULL DEFAULT '[0, 1, 2, 3, 4, 5, 6]';
