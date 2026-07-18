-- CreateTable
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billing_email" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "team_name" TEXT,
    "role_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hourly_rate" DECIMAL(10,2) DEFAULT 0.00,
    "oidc_provider" TEXT,
    "oidc_issuer" TEXT,
    "oidc_subject" TEXT,
    "last_login_provider" TEXT,
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "weekly_hour_limit" INTEGER,
    "employment_type" TEXT,
    "min_weekly_hours" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "organization_id" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organization_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "organization_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "budget_hours" INTEGER,
    "budget_amount" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectMember" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_in_project" TEXT NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TimeEntry" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "organization_id" TEXT NOT NULL,
    "task_description" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "entry_type" TEXT NOT NULL,
    "notes" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stop_reason" TEXT,
    "auto_stopped" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ActiveTimer" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "organization_id" TEXT NOT NULL,
    "task_description" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "persisted_state" JSONB NOT NULL DEFAULT '{}',
    "last_active_ping" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_client_activity_at" TIMESTAMP(3),
    "client_visibility" TEXT,
    "client_has_focus" BOOLEAN,
    "heartbeat_state" JSONB NOT NULL DEFAULT '{}',
    "heartbeat_miss_count" INTEGER NOT NULL DEFAULT 0,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" TEXT,
    "paused_at" TIMESTAMP(3),
    "idle_warning_shown_at" TIMESTAMP(3),
    "paused_duration_seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActiveTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TimerCorrectionRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimerCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TimerPolicyConfig" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "scope_id" TEXT,
    "organization_id" TEXT,
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimerPolicyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuthEvent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "organization_id" TEXT,
    "event_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Integration" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarConnection" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "google_email" TEXT,
    "refresh_token" TEXT NOT NULL,
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MfaChallenge" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login_mfa',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportCache" (
    "id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "organization_id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TimeEntryTag" (
    "time_entry_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "TimeEntryTag_pkey" PRIMARY KEY ("time_entry_id","tag_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_email" TEXT,
    "project_id" TEXT,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_rate" DECIMAL(5,2),
    "total" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "due_date" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "time_entry_id" TEXT,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_billable" BOOLEAN NOT NULL DEFAULT true,
    "budget_hours" INTEGER,
    "budget_amount" DECIMAL(10,2),
    "tag_ids" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledReport" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "report_type" TEXT NOT NULL DEFAULT 'summary',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "unlocked_at" TIMESTAMP(3),
    "unlocked_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandingConfig" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "app_name" TEXT,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#4F46E5',
    "secondary_color" TEXT NOT NULL DEFAULT '#7C3AED',
    "custom_domain" TEXT,
    "email_from_name" TEXT,
    "email_from_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccessRequest" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "team_size" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "days" DECIMAL(4,1) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewer_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeaveRequestHistory" (
    "id" TEXT NOT NULL,
    "leave_request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequestHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Organization_status_created_at_idx" ON "Organization"("status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_organization_id_is_active_idx" ON "User"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_organization_id_role_id_idx" ON "User"("organization_id", "role_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_organization_id_employment_type_idx" ON "User"("organization_id", "employment_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_team_name_idx" ON "User"("team_name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_organization_id_key" ON "User"("email", "organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Role_organization_id_idx" ON "Role"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_organization_id_key" ON "Role"("name", "organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Team_organization_id_is_active_name_idx" ON "Team"("organization_id", "is_active", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Team_organization_id_name_key" ON "Team"("organization_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_organization_id_is_active_idx" ON "Project"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Project_name_organization_id_key" ON "Project"("name", "organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimeEntry_organization_id_user_id_start_time_idx" ON "TimeEntry"("organization_id", "user_id", "start_time");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimeEntry_organization_id_project_id_start_time_idx" ON "TimeEntry"("organization_id", "project_id", "start_time");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimeEntry_organization_id_status_created_at_idx" ON "TimeEntry"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ActiveTimer_user_id_key" ON "ActiveTimer"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActiveTimer_organization_id_user_id_idx" ON "ActiveTimer"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimerCorrectionRequest_organization_id_user_id_status_creat_idx" ON "TimerCorrectionRequest"("organization_id", "user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimerPolicyConfig_organization_id_idx" ON "TimerPolicyConfig"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TimerPolicyConfig_scope_type_scope_id_key" ON "TimerPolicyConfig"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_organization_id_user_id_deleted_at_is_read_cre_idx" ON "Notification"("organization_id", "user_id", "deleted_at", "is_read", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_organization_id_created_at_idx" ON "AuditLog"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_organization_id_user_id_created_at_idx" ON "AuditLog"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthEvent_organization_id_created_at_idx" ON "AuthEvent"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthEvent_user_id_created_at_idx" ON "AuthEvent"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthEvent_email_created_at_idx" ON "AuthEvent"("email", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthEvent_event_type_outcome_created_at_idx" ON "AuthEvent"("event_type", "outcome", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Integration_organization_id_idx" ON "Integration"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Integration_type_organization_id_key" ON "Integration"("type", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarConnection_user_id_key" ON "CalendarConnection"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MfaChallenge_user_id_purpose_used_at_expires_at_idx" ON "MfaChallenge"("user_id", "purpose", "used_at", "expires_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportCache_organization_id_report_type_generated_at_idx" ON "ReportCache"("organization_id", "report_type", "generated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Tag_organization_id_idx" ON "Tag"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_organization_id_key" ON "Tag"("name", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoice_number_key" ON "Invoice"("invoice_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_organization_id_status_created_at_idx" ON "Invoice"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectTemplate_organization_id_idx" ON "ProjectTemplate"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTemplate_name_organization_id_key" ON "ProjectTemplate"("name", "organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookSubscription_organization_id_is_active_idx" ON "WebhookSubscription"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledReport_organization_id_is_active_idx" ON "ScheduledReport"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollPeriod_organization_id_status_start_date_idx" ON "PayrollPeriod"("organization_id", "status", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPeriod_organization_id_start_date_end_date_key" ON "PayrollPeriod"("organization_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrandingConfig_organization_id_key" ON "BrandingConfig"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccessRequest_organization_id_status_created_at_idx" ON "AccessRequest"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveRequest_organization_id_user_id_start_date_idx" ON "LeaveRequest"("organization_id", "user_id", "start_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveRequest_organization_id_status_start_date_idx" ON "LeaveRequest"("organization_id", "status", "start_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveRequestHistory_leave_request_id_created_at_idx" ON "LeaveRequestHistory"("leave_request_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_role_id_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_organization_id_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Role_organization_id_fkey') THEN
        ALTER TABLE "Role" ADD CONSTRAINT "Role_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Team_organization_id_fkey') THEN
        ALTER TABLE "Team" ADD CONSTRAINT "Team_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_organization_id_fkey') THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectMember_project_id_fkey') THEN
        ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectMember_user_id_fkey') THEN
        ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_organization_id_fkey') THEN
        ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_user_id_fkey') THEN
        ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_project_id_fkey') THEN
        ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActiveTimer_organization_id_fkey') THEN
        ALTER TABLE "ActiveTimer" ADD CONSTRAINT "ActiveTimer_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActiveTimer_user_id_fkey') THEN
        ALTER TABLE "ActiveTimer" ADD CONSTRAINT "ActiveTimer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActiveTimer_project_id_fkey') THEN
        ALTER TABLE "ActiveTimer" ADD CONSTRAINT "ActiveTimer_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimerCorrectionRequest_organization_id_fkey') THEN
        ALTER TABLE "TimerCorrectionRequest" ADD CONSTRAINT "TimerCorrectionRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimerCorrectionRequest_user_id_fkey') THEN
        ALTER TABLE "TimerCorrectionRequest" ADD CONSTRAINT "TimerCorrectionRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimerPolicyConfig_organization_id_fkey') THEN
        ALTER TABLE "TimerPolicyConfig" ADD CONSTRAINT "TimerPolicyConfig_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_organization_id_fkey') THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_user_id_fkey') THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_organization_id_fkey') THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_user_id_fkey') THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuthEvent_organization_id_fkey') THEN
        ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuthEvent_user_id_fkey') THEN
        ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Integration_organization_id_fkey') THEN
        ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarConnection_user_id_fkey') THEN
        ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_user_id_fkey') THEN
        ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MfaChallenge_user_id_fkey') THEN
        ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportCache_organization_id_fkey') THEN
        ALTER TABLE "ReportCache" ADD CONSTRAINT "ReportCache_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Tag_organization_id_fkey') THEN
        ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntryTag_time_entry_id_fkey') THEN
        ALTER TABLE "TimeEntryTag" ADD CONSTRAINT "TimeEntryTag_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntryTag_tag_id_fkey') THEN
        ALTER TABLE "TimeEntryTag" ADD CONSTRAINT "TimeEntryTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_organization_id_fkey') THEN
        ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_project_id_fkey') THEN
        ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_user_id_fkey') THEN
        ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceLineItem_invoice_id_fkey') THEN
        ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceLineItem_time_entry_id_fkey') THEN
        ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "TimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectTemplate_organization_id_fkey') THEN
        ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectTemplate_created_by_fkey') THEN
        ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookSubscription_organization_id_fkey') THEN
        ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledReport_organization_id_fkey') THEN
        ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledReport_user_id_fkey') THEN
        ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollPeriod_organization_id_fkey') THEN
        ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollPeriod_locked_by_fkey') THEN
        ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandingConfig_organization_id_fkey') THEN
        ALTER TABLE "BrandingConfig" ADD CONSTRAINT "BrandingConfig_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessRequest_organization_id_fkey') THEN
        ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_organization_id_fkey') THEN
        ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_user_id_fkey') THEN
        ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_reviewed_by_fkey') THEN
        ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequestHistory_leave_request_id_fkey') THEN
        ALTER TABLE "LeaveRequestHistory" ADD CONSTRAINT "LeaveRequestHistory_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequestHistory_actor_id_fkey') THEN
        ALTER TABLE "LeaveRequestHistory" ADD CONSTRAINT "LeaveRequestHistory_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

