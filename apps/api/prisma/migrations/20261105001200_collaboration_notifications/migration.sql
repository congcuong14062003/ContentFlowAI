ALTER TABLE "Content" ADD COLUMN "ownerId" UUID, ADD COLUMN "assigneeId" UUID, ADD COLUMN "reviewerId" UUID, ADD COLUMN "reviewRequesterId" UUID;
ALTER TABLE "Content" ADD CONSTRAINT "Content_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Content" ADD CONSTRAINT "Content_reviewRequesterId_fkey" FOREIGN KEY ("reviewRequesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Content_workspaceId_assigneeId_status_idx" ON "Content"("workspaceId","assigneeId","status");
UPDATE "Content" c SET "ownerId" = r."actorId" FROM "ContentRevision" r WHERE r."workspaceId"=c."workspaceId" AND r."contentId"=c.id AND r.version=1 AND r."actorId" IS NOT NULL;

CREATE TABLE "ContentComment" (
  "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "contentId" UUID NOT NULL, "authorId" UUID NOT NULL,
  "body" VARCHAR(5000) NOT NULL, "mentions" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentComment_workspaceId_contentId_fkey" FOREIGN KEY ("workspaceId","contentId") REFERENCES "Content"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContentComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContentComment_workspaceId_contentId_createdAt_id_idx" ON "ContentComment"("workspaceId","contentId","createdAt","id");

CREATE TABLE "Notification" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "workspaceId" UUID, "eventType" VARCHAR(40) NOT NULL,
  "dedupeKey" VARCHAR(160) NOT NULL, "title" VARCHAR(200) NOT NULL, "body" VARCHAR(1000) NOT NULL,
  "url" VARCHAR(500) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(3), "archivedAt" TIMESTAMPTZ(3), "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId","dedupeKey");
CREATE INDEX "Notification_userId_archivedAt_createdAt_id_idx" ON "Notification"("userId","archivedAt","createdAt","id");
CREATE INDEX "Notification_workspaceId_createdAt_idx" ON "Notification"("workspaceId","createdAt");

CREATE TABLE "NotificationPreference" (
  "userId" UUID NOT NULL, "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mutedTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "lowCreditThreshold" BIGINT, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "NotificationPreference_lowCreditThreshold_check" CHECK ("lowCreditThreshold" IS NULL OR "lowCreditThreshold" >= 0),
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "Notification" (id,"userId","workspaceId","eventType","dedupeKey",title,body,url,"createdAt","readAt")
SELECT gen_random_uuid(),s."userId",s."workspaceId",'SUPPORT_REPLY','support:'||s."messageId"::text,'Support reply','A support agent replied to your ticket',
  '/w/'||s."workspaceId"::text||'/support',s."createdAt",s."readAt"
FROM "SupportNotification" s;
