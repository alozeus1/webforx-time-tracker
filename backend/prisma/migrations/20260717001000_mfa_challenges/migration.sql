CREATE TABLE IF NOT EXISTS "MfaChallenge" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login_mfa',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MfaChallenge_user_id_purpose_used_at_expires_at_idx"
ON "MfaChallenge"("user_id", "purpose", "used_at", "expires_at");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MfaChallenge_user_id_fkey') THEN
        ALTER TABLE "MfaChallenge"
        ADD CONSTRAINT "MfaChallenge_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
