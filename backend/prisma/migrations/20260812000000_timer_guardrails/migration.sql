-- Migration: Timer guardrails (daily cap, clash detection, recovered-time quota,
--            abandoned-timer clamping)
-- Created: 2026-08-12
--
-- Entirely additive and idempotent. Every column is nullable or defaulted so it is
-- safe to apply to the live table while the API is serving traffic, and existing
-- rows keep their current meaning without a backfill.
--
-- Deliberately NOT included: a Postgres EXCLUDE USING GIST constraint to forbid
-- overlapping time entries. Production already contains overlapping rows (the
-- Workday "recovered suggestions" path wrote entries with no overlap check), so
-- building the index would fail, and the rule we actually need spans two tables
-- ("pending or approved entries, plus pending correction requests"). Overlap is
-- therefore enforced in the application layer by timeOverlapService.

-- User: day boundary for daily-cap and weekly-quota maths.
-- NULL means "unknown", which resolves to UTC at read time.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT;

-- TimeEntry: over-cap attestation + auto-stop acknowledgement.
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "over_daily_cap" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "overtime_reason" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "auto_stop_reviewed_at" TIMESTAMP(3);

-- TimerPolicyConfig: the new admin-tunable knobs.
-- daily_cap_hours is distinct from max_session_duration_hours: the latter caps one
-- continuous session, the former caps a whole calendar day in the user's timezone.
ALTER TABLE "TimerPolicyConfig" ADD COLUMN IF NOT EXISTS "daily_cap_hours" DECIMAL(4,2) NOT NULL DEFAULT 8.0;
ALTER TABLE "TimerPolicyConfig" ADD COLUMN IF NOT EXISTS "intern_daily_floor_hours" DECIMAL(4,2) NOT NULL DEFAULT 2.0;
ALTER TABLE "TimerPolicyConfig" ADD COLUMN IF NOT EXISTS "weekly_recovery_limit" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "TimerPolicyConfig" ADD COLUMN IF NOT EXISTS "abandoned_timer_grace_minutes" INTEGER NOT NULL DEFAULT 15;
-- Liveness marker for the stale-timer sweep, which runs from GitHub Actions because
-- Vercel Hobby rejects sub-daily cron. GitHub disables scheduled workflows after 60
-- days of repo inactivity and does so silently, so the admin screen surfaces staleness.
ALTER TABLE "TimerPolicyConfig" ADD COLUMN IF NOT EXISTS "last_sweep_at" TIMESTAMP(3);

-- RecoveryOverrideGrant: an Admin handing a user extra correction requests for one
-- week once the weekly quota is spent. Week-scoped so a grant cannot leak forward.
CREATE TABLE IF NOT EXISTS "RecoveryOverrideGrant" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "granted_by" TEXT NOT NULL,
  "week_start" TIMESTAMP(3) NOT NULL,
  "extra_requests" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryOverrideGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecoveryOverrideGrant_organization_id_user_id_week_start_idx"
    ON "RecoveryOverrideGrant" ("organization_id", "user_id", "week_start");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryOverrideGrant_organization_id_fkey') THEN
        ALTER TABLE "RecoveryOverrideGrant" ADD CONSTRAINT "RecoveryOverrideGrant_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryOverrideGrant_user_id_fkey') THEN
        ALTER TABLE "RecoveryOverrideGrant" ADD CONSTRAINT "RecoveryOverrideGrant_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
