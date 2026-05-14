ALTER TABLE "User" ADD COLUMN "team_name" TEXT;

CREATE INDEX "User_team_name_idx" ON "User"("team_name");
