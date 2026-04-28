-- Phase 1/2 timer resilience fields. All additions are backwards-compatible.
ALTER TABLE "ActiveTimer"
ADD COLUMN IF NOT EXISTS "heartbeat_miss_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pause_reason" TEXT,
ADD COLUMN IF NOT EXISTS "idle_warning_shown_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TimerCorrectionRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timer_session_id" TEXT,
    "requested_start_time" TIMESTAMP(3) NOT NULL,
    "requested_end_time" TIMESTAMP(3) NOT NULL,
    "requested_duration_seconds" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "work_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewer_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimerCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TimerPolicyConfig" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scope_id" TEXT,
    "heartbeat_interval_seconds" INTEGER NOT NULL DEFAULT 180,
    "missed_heartbeat_warning_threshold" INTEGER NOT NULL DEFAULT 3,
    "missed_heartbeat_pause_threshold" INTEGER NOT NULL DEFAULT 4,
    "idle_warning_after_minutes" INTEGER NOT NULL DEFAULT 5,
    "idle_pause_after_minutes" INTEGER NOT NULL DEFAULT 10,
    "max_session_duration_hours" DECIMAL(4,2) NOT NULL DEFAULT 8.0,
    "allow_resume_after_idle_pause" BOOLEAN NOT NULL DEFAULT true,
    "require_note_on_resume_after_minutes" INTEGER NOT NULL DEFAULT 30,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimerPolicyConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimerCorrectionRequest_user_id_status_created_at_idx"
ON "TimerCorrectionRequest"("user_id", "status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "TimerPolicyConfig_scope_type_scope_id_key"
ON "TimerPolicyConfig"("scope_type", "scope_id");

CREATE INDEX IF NOT EXISTS "TimerPolicyConfig_scope_type_scope_id_idx"
ON "TimerPolicyConfig"("scope_type", "scope_id");

ALTER TABLE "TimerCorrectionRequest"
ADD CONSTRAINT "TimerCorrectionRequest_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

