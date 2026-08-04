-- Isolated workforce scheduling, expense management, and opt-in geofencing.
-- Geofencing is disabled by default because its policy lives in Organization.settings.

CREATE TABLE "ScheduleEntry" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT,
  "created_by" TEXT,
  "title" TEXT NOT NULL,
  "entry_type" TEXT NOT NULL DEFAULT 'shift',
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "color" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "incurred_on" TIMESTAMP(3) NOT NULL,
  "is_billable" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "reviewer_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseAttachment" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "expense_id" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeofenceZone" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rule_type" TEXT NOT NULL DEFAULT 'allow',
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "radius_meters" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeofenceZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimerLocationEvent" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "active_timer_id" TEXT,
  "zone_id" TEXT,
  "event_type" TEXT NOT NULL DEFAULT 'clock_in',
  "decision" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracy_meters" DOUBLE PRECISION,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimerLocationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InvoiceLineItem" ADD COLUMN "expense_id" TEXT;

CREATE UNIQUE INDEX "InvoiceLineItem_expense_id_key" ON "InvoiceLineItem"("expense_id");
CREATE INDEX "ScheduleEntry_organization_id_start_time_end_time_idx" ON "ScheduleEntry"("organization_id", "start_time", "end_time");
CREATE INDEX "ScheduleEntry_organization_id_user_id_start_time_idx" ON "ScheduleEntry"("organization_id", "user_id", "start_time");
CREATE INDEX "Expense_organization_id_status_incurred_on_idx" ON "Expense"("organization_id", "status", "incurred_on");
CREATE INDEX "Expense_organization_id_user_id_incurred_on_idx" ON "Expense"("organization_id", "user_id", "incurred_on");
CREATE INDEX "Expense_organization_id_project_id_is_billable_idx" ON "Expense"("organization_id", "project_id", "is_billable");
CREATE INDEX "ExpenseAttachment_organization_id_expense_id_idx" ON "ExpenseAttachment"("organization_id", "expense_id");
CREATE UNIQUE INDEX "ExpenseAttachment_organization_id_object_key_key" ON "ExpenseAttachment"("organization_id", "object_key");
CREATE INDEX "GeofenceZone_organization_id_is_active_rule_type_idx" ON "GeofenceZone"("organization_id", "is_active", "rule_type");
CREATE INDEX "TimerLocationEvent_organization_id_user_id_recorded_at_idx" ON "TimerLocationEvent"("organization_id", "user_id", "recorded_at");
CREATE INDEX "TimerLocationEvent_organization_id_decision_recorded_at_idx" ON "TimerLocationEvent"("organization_id", "decision", "recorded_at");

ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeofenceZone" ADD CONSTRAINT "GeofenceZone_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimerLocationEvent" ADD CONSTRAINT "TimerLocationEvent_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimerLocationEvent" ADD CONSTRAINT "TimerLocationEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimerLocationEvent" ADD CONSTRAINT "TimerLocationEvent_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "GeofenceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
