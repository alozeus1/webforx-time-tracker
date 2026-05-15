-- Backfill the existing single-tenant production database into the new organization-scoped schema.
-- Keep this migration data-preserving: add columns as nullable, populate them, then enforce NOT NULL.

CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billing_email" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Organization" ("id", "name", "slug", "billing_email", "plan", "status", "settings", "updated_at")
VALUES ('webforx-default-org', 'Web Forx Technology', 'webforx-tech', 'admin@webforxtech.com', 'enterprise', 'active', '{}', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "slug" = EXCLUDED."slug",
    "billing_email" = EXCLUDED."billing_email",
    "plan" = EXCLUDED."plan",
    "status" = EXCLUDED."status",
    "updated_at" = CURRENT_TIMESTAMP;

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

INSERT INTO "TimerPolicyConfig" ("id", "scope_type", "scope_id", "updated_at")
SELECT 'global-default-policy', 'GLOBAL', NULL, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "TimerPolicyConfig" WHERE "scope_type" = 'GLOBAL' AND "scope_id" IS NULL);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "ActiveTimer" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "TimerCorrectionRequest" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "TimerPolicyConfig" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "AuthEvent" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "ReportCache" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "ProjectTemplate" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "WebhookSubscription" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "ScheduledReport" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "AccessRequest" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

UPDATE "User" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "Role" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "Project" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "TimeEntry" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "ActiveTimer" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "TimerCorrectionRequest" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "TimerPolicyConfig" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "Notification" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "AuditLog" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "AuthEvent" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "Integration" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "ReportCache" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "Tag" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "Invoice" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "ProjectTemplate" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "WebhookSubscription" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "ScheduledReport" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;
UPDATE "AccessRequest" SET "organization_id" = 'webforx-default-org' WHERE "organization_id" IS NULL;

ALTER TABLE "User" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "TimeEntry" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "ActiveTimer" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "TimerCorrectionRequest" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "Integration" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "ReportCache" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "Tag" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "ProjectTemplate" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "WebhookSubscription" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "ScheduledReport" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "TimerPolicyConfig" ALTER COLUMN "scope_type" SET DEFAULT 'ORGANIZATION';

DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "Role_name_key";
DROP INDEX IF EXISTS "Project_name_key";
DROP INDEX IF EXISTS "TimerCorrectionRequest_user_id_status_created_at_idx";
DROP INDEX IF EXISTS "TimerPolicyConfig_scope_type_scope_id_idx";
DROP INDEX IF EXISTS "Notification_user_id_deleted_at_is_read_created_at_idx";
DROP INDEX IF EXISTS "Integration_type_key";
DROP INDEX IF EXISTS "Tag_name_key";
DROP INDEX IF EXISTS "ProjectTemplate_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_status_created_at_idx" ON "Organization"("status", "created_at");
CREATE INDEX IF NOT EXISTS "User_organization_id_is_active_idx" ON "User"("organization_id", "is_active");
CREATE INDEX IF NOT EXISTS "User_organization_id_role_id_idx" ON "User"("organization_id", "role_id");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_organization_id_key" ON "User"("email", "organization_id");
CREATE INDEX IF NOT EXISTS "Role_organization_id_idx" ON "Role"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_organization_id_key" ON "Role"("name", "organization_id");
CREATE INDEX IF NOT EXISTS "Project_organization_id_is_active_idx" ON "Project"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_name_organization_id_key" ON "Project"("name", "organization_id");
CREATE INDEX IF NOT EXISTS "TimeEntry_organization_id_user_id_start_time_idx" ON "TimeEntry"("organization_id", "user_id", "start_time");
CREATE INDEX IF NOT EXISTS "TimeEntry_organization_id_project_id_start_time_idx" ON "TimeEntry"("organization_id", "project_id", "start_time");
CREATE INDEX IF NOT EXISTS "TimeEntry_organization_id_status_created_at_idx" ON "TimeEntry"("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ActiveTimer_organization_id_user_id_idx" ON "ActiveTimer"("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "TimerCorrectionRequest_organization_id_user_id_status_creat_idx" ON "TimerCorrectionRequest"("organization_id", "user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "TimerPolicyConfig_organization_id_idx" ON "TimerPolicyConfig"("organization_id");
CREATE INDEX IF NOT EXISTS "Notification_organization_id_user_id_deleted_at_is_read_cre_idx" ON "Notification"("organization_id", "user_id", "deleted_at", "is_read", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_organization_id_created_at_idx" ON "AuditLog"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_organization_id_user_id_created_at_idx" ON "AuditLog"("organization_id", "user_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuthEvent_organization_id_created_at_idx" ON "AuthEvent"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "Integration_organization_id_idx" ON "Integration"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Integration_type_organization_id_key" ON "Integration"("type", "organization_id");
CREATE INDEX IF NOT EXISTS "ReportCache_organization_id_report_type_generated_at_idx" ON "ReportCache"("organization_id", "report_type", "generated_at");
CREATE INDEX IF NOT EXISTS "Tag_organization_id_idx" ON "Tag"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_organization_id_key" ON "Tag"("name", "organization_id");
CREATE INDEX IF NOT EXISTS "Invoice_organization_id_status_created_at_idx" ON "Invoice"("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ProjectTemplate_organization_id_idx" ON "ProjectTemplate"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTemplate_name_organization_id_key" ON "ProjectTemplate"("name", "organization_id");
CREATE INDEX IF NOT EXISTS "WebhookSubscription_organization_id_is_active_idx" ON "WebhookSubscription"("organization_id", "is_active");
CREATE INDEX IF NOT EXISTS "ScheduledReport_organization_id_is_active_idx" ON "ScheduledReport"("organization_id", "is_active");
CREATE INDEX IF NOT EXISTS "AccessRequest_organization_id_status_created_at_idx" ON "AccessRequest"("organization_id", "status", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_organization_id_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Role_organization_id_fkey') THEN
        ALTER TABLE "Role" ADD CONSTRAINT "Role_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_organization_id_fkey') THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_organization_id_fkey') THEN
        ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActiveTimer_organization_id_fkey') THEN
        ALTER TABLE "ActiveTimer" ADD CONSTRAINT "ActiveTimer_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimerCorrectionRequest_organization_id_fkey') THEN
        ALTER TABLE "TimerCorrectionRequest" ADD CONSTRAINT "TimerCorrectionRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimerPolicyConfig_organization_id_fkey') THEN
        ALTER TABLE "TimerPolicyConfig" ADD CONSTRAINT "TimerPolicyConfig_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_organization_id_fkey') THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_organization_id_fkey') THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuthEvent_organization_id_fkey') THEN
        ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Integration_organization_id_fkey') THEN
        ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportCache_organization_id_fkey') THEN
        ALTER TABLE "ReportCache" ADD CONSTRAINT "ReportCache_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Tag_organization_id_fkey') THEN
        ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_organization_id_fkey') THEN
        ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectTemplate_organization_id_fkey') THEN
        ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookSubscription_organization_id_fkey') THEN
        ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledReport_organization_id_fkey') THEN
        ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessRequest_organization_id_fkey') THEN
        ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
