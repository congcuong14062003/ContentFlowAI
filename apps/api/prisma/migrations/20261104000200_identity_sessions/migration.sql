ALTER TABLE "Session" ADD COLUMN "accessTokenHash" VARCHAR(128), ADD COLUMN "accessExpiresAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "Session_accessTokenHash_key" ON "Session"("accessTokenHash");
