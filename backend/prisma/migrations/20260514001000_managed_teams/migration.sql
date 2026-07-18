CREATE TABLE IF NOT EXISTS "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Team_name_key" ON "Team"("name");
CREATE INDEX IF NOT EXISTS "Team_is_active_name_idx" ON "Team"("is_active", "name");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Team' AND column_name = 'organization_id'
    ) THEN
        INSERT INTO "Team" ("id", "name", "description")
        VALUES
            ('team-devsecops', 'DevSecOps', 'Security, compliance, and infrastructure operations.'),
            ('team-platform-engineering', 'Platform Engineering', 'Shared platform, deployment, and developer experience work.'),
            ('team-developers', 'Developers', 'Product and application engineering.'),
            ('team-qa-teams', 'QA Teams', 'Quality assurance and testing.'),
            ('team-pocs', 'PoCs', 'Proof-of-concept and discovery work.')
        ON CONFLICT ("name") DO NOTHING;
    END IF;
END $$;
