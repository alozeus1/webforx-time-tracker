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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPeriod_organization_id_start_date_end_date_key" ON "PayrollPeriod"("organization_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollPeriod_organization_id_status_start_date_idx" ON "PayrollPeriod"("organization_id", "status", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BrandingConfig_organization_id_key" ON "BrandingConfig"("organization_id");

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
