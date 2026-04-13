-- AlterTable: add pause fields to ActiveTimer
ALTER TABLE "ActiveTimer" ADD COLUMN "is_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ActiveTimer" ADD COLUMN "paused_at" TIMESTAMP(3);
ALTER TABLE "ActiveTimer" ADD COLUMN "paused_duration_seconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: AccessRequest
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "teamSize" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);
