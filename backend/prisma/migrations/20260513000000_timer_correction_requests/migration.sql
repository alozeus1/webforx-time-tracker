CREATE TABLE "TimerCorrectionRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimerCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimerCorrectionRequest_user_id_created_at_idx" ON "TimerCorrectionRequest"("user_id", "created_at");
CREATE INDEX "TimerCorrectionRequest_status_created_at_idx" ON "TimerCorrectionRequest"("status", "created_at");

ALTER TABLE "TimerCorrectionRequest"
ADD CONSTRAINT "TimerCorrectionRequest_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
