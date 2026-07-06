-- Migration: Password policy — track when each user's password was last changed
-- Created: 2026-07-06

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);
