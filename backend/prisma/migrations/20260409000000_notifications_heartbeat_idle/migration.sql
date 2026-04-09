-- Add durable notification lifecycle fields.
ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Notification_user_id_deleted_at_is_read_created_at_idx"
ON "Notification"("user_id", "deleted_at", "is_read", "created_at");

-- Add richer heartbeat state for server-side idle enforcement.
ALTER TABLE "ActiveTimer"
ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "last_client_activity_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "client_visibility" TEXT,
ADD COLUMN IF NOT EXISTS "client_has_focus" BOOLEAN,
ADD COLUMN IF NOT EXISTS "heartbeat_state" JSONB NOT NULL DEFAULT '{}';

UPDATE "ActiveTimer"
SET "last_heartbeat_at" = COALESCE("last_heartbeat_at", "last_active_ping", "start_time")
WHERE "last_heartbeat_at" IS NULL;

-- Persist auto-stop reasons on completed timer entries.
ALTER TABLE "TimeEntry"
ADD COLUMN IF NOT EXISTS "stop_reason" TEXT,
ADD COLUMN IF NOT EXISTS "auto_stopped" BOOLEAN NOT NULL DEFAULT false;

