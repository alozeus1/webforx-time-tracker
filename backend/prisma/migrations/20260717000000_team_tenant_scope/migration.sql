-- Tenant-scope Team without guessing ownership.
-- Backfill strategy:
-- 1. Add organization_id nullable.
-- 2. Backfill teams referenced by users when a team name maps to exactly one org.
-- 3. Backfill orphan teams only if the database has exactly one organization.
-- 4. Fail closed with an exception report for ambiguous or orphaned teams.
-- 5. Enforce FK, NOT NULL, and tenant-scoped uniqueness.

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

WITH team_orgs AS (
    SELECT
        t."id" AS team_id,
        MIN(u."organization_id") AS organization_id,
        COUNT(DISTINCT u."organization_id") AS org_count
    FROM "Team" t
    JOIN "User" u ON u."team_name" = t."name"
    WHERE u."organization_id" IS NOT NULL
    GROUP BY t."id"
)
UPDATE "Team" t
SET "organization_id" = team_orgs."organization_id"
FROM team_orgs
WHERE t."id" = team_orgs.team_id
  AND t."organization_id" IS NULL
  AND team_orgs.org_count = 1;

DO $$
DECLARE
    org_count integer;
    only_org_id text;
BEGIN
    SELECT COUNT(*), MIN("id") INTO org_count, only_org_id FROM "Organization";

    IF org_count = 1 THEN
        UPDATE "Team"
        SET "organization_id" = only_org_id
        WHERE "organization_id" IS NULL;
    END IF;
END $$;

DO $$
DECLARE
    ambiguous text;
    orphaned text;
BEGIN
    SELECT string_agg(t."name", ', ' ORDER BY t."name")
    INTO ambiguous
    FROM "Team" t
    JOIN "User" u ON u."team_name" = t."name"
    GROUP BY t."id"
    HAVING COUNT(DISTINCT u."organization_id") > 1
    LIMIT 1;

    SELECT string_agg(t."name", ', ' ORDER BY t."name")
    INTO orphaned
    FROM "Team" t
    WHERE t."organization_id" IS NULL;

    IF ambiguous IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot backfill Team.organization_id; ambiguous team names across organizations: %', ambiguous;
    END IF;

    IF orphaned IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot backfill Team.organization_id; orphaned teams need operator assignment: %', orphaned;
    END IF;
END $$;

ALTER TABLE "Team" ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX IF EXISTS "Team_name_key";
DROP INDEX IF EXISTS "Team_is_active_name_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Team_organization_id_name_key" ON "Team"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "Team_organization_id_is_active_name_idx" ON "Team"("organization_id", "is_active", "name");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Team_organization_id_fkey') THEN
        ALTER TABLE "Team"
        ADD CONSTRAINT "Team_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
