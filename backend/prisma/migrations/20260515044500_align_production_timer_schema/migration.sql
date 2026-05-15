-- Align production drift left by older deployments that predated the timer policy and
-- correction-request schema used by the current Prisma client.

ALTER TABLE "ActiveTimer"
ADD COLUMN IF NOT EXISTS "heartbeat_miss_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pause_reason" TEXT,
ADD COLUMN IF NOT EXISTS "idle_warning_shown_at" TIMESTAMP(3);

ALTER TABLE "TimerCorrectionRequest"
ADD COLUMN IF NOT EXISTS "timer_session_id" TEXT;

ALTER TABLE "Organization" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "Team" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "TimerPolicyConfig" ALTER COLUMN "updated_at" DROP DEFAULT;

DROP INDEX IF EXISTS "TimerCorrectionRequest_status_created_at_idx";
DROP INDEX IF EXISTS "TimerCorrectionRequest_user_id_created_at_idx";

ALTER TABLE "TimerCorrectionRequest" DROP CONSTRAINT IF EXISTS "TimerCorrectionRequest_user_id_fkey";
ALTER TABLE "TimerCorrectionRequest"
ADD CONSTRAINT "TimerCorrectionRequest_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "TimerPolicyConfig_scope_type_scope_id_key"
ON "TimerPolicyConfig"("scope_type", "scope_id");
