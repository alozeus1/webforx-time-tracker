ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "team_name" TEXT;

CREATE INDEX IF NOT EXISTS "User_team_name_idx" ON "User"("team_name");
