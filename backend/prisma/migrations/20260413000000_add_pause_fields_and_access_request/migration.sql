-- AlterTable: add pause fields to ActiveTimer
ALTER TABLE "ActiveTimer" ADD COLUMN "is_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ActiveTimer" ADD COLUMN "paused_at" TIMESTAMP(3);
ALTER TABLE "ActiveTimer" ADD COLUMN "paused_duration_seconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: AccessRequest
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "team_size" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);
