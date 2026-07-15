-- Migration: Employment type + per-user minimum weekly hours
-- Created: 2026-07-15
--
-- Separates worker classification (employment_type) from the access role.
-- Additive and idempotent. Existing rows are intentionally left NULL
-- (unclassified) — no backfill, per product decision. New users receive an
-- employment_type at the application layer; a NULL value falls back to the
-- organization's default target for reporting only.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employment_type" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "min_weekly_hours" INTEGER;

CREATE INDEX IF NOT EXISTS "User_organization_id_employment_type_idx"
    ON "User" ("organization_id", "employment_type");
