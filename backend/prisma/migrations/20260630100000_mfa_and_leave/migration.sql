-- Migration: MFA fields on User + LeaveRequest table
-- Created: 2026-06-30

-- Add MFA columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfa_secret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Create LeaveRequest table
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    "id"              TEXT NOT NULL,
    "user_id"         TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "leave_type"      TEXT NOT NULL,
    "start_date"      TIMESTAMP(3) NOT NULL,
    "end_date"        TIMESTAMP(3) NOT NULL,
    "days"            DECIMAL(4,1) NOT NULL,
    "reason"          TEXT,
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by"     TEXT,
    "reviewed_at"     TIMESTAMP(3),
    "reviewer_note"   TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "LeaveRequest_org_user_start_idx"
    ON "LeaveRequest"("organization_id", "user_id", "start_date");

CREATE INDEX IF NOT EXISTS "LeaveRequest_org_status_start_idx"
    ON "LeaveRequest"("organization_id", "status", "start_date");
