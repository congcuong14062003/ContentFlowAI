BEGIN;
ALTER TABLE "Workspace" ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
ALTER TABLE "Campaign" ADD COLUMN "objective" VARCHAR(2000) NOT NULL DEFAULT '',
  ADD COLUMN "audiences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'PLANNED',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "brandId" UUID;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_status_valid" CHECK ("status" IN ('PLANNED','ACTIVE','COMPLETED','ARCHIVED'));
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_version_positive" CHECK ("version" > 0);
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_dates_ordered" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" <= "endsAt");
CREATE INDEX "Campaign_workspaceId_status_startsAt_idx" ON "Campaign"("workspaceId", "status", "startsAt");
ALTER TABLE "Content" ADD COLUMN "scheduledAt" TIMESTAMPTZ(3), ADD COLUMN "publishedAt" TIMESTAMPTZ(3);
ALTER TABLE "Content" ADD CONSTRAINT "Content_scheduled_status" CHECK ("status" <> 'SCHEDULED' OR "scheduledAt" IS NOT NULL);
ALTER TABLE "Content" ADD CONSTRAINT "Content_published_status" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
CREATE INDEX "Content_workspaceId_scheduledAt_status_idx" ON "Content"("workspaceId", "scheduledAt", "status");
COMMIT;
