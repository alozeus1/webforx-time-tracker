-- Migration: Timesheet rejection transparency (reason code, note, reviewer, timestamp)
-- Created: 2026-09-01
--
-- Timestamp is deliberately later than 20260812000000_timer_guardrails, the previous
-- maximum. Two migrations sharing a timestamp prefix has caused an incident here, so
-- check `ls backend/prisma/migrations` for the current maximum before adding another.
--
-- Entirely additive, nullable, and idempotent: safe to apply to the live table while
-- the API is serving traffic, which is what makes the migrate-before-deploy order in
-- DEPLOYMENT.md correct.
--
-- NO BACKFILL, BY DESIGN. Every row already carrying status = 'rejected' keeps a NULL
-- reason. Those rejections are historical facts about which nobody recorded a reason;
-- inventing one would put words in a reviewer's mouth and make an audit trail lie.
-- Every read path renders NULL as "No reason recorded".
--
-- `reviewed_by` holds a User id but takes no FOREIGN KEY constraint, matching
-- TimerCorrectionRequest.reviewed_by, which is the same column on the same kind of
-- review action. Adding a constraint to a hot table is not additive in the sense this
-- ordering relies on, and a deleted reviewer must not make an old entry unreadable.

ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "rejection_reason_code" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "rejection_reason_note" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "reviewed_by" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
