ALTER TABLE "Payment" ADD COLUMN "collectedAt" TIMESTAMPTZ(3);
UPDATE "Payment" SET "collectedAt" = "updatedAt" WHERE status = 'SUCCEEDED';

CREATE TABLE "SupportTicket" (
  "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "requesterId" UUID NOT NULL, "assigneeId" UUID,
  "subject" VARCHAR(200) NOT NULL, "kind" VARCHAR(16) NOT NULL DEFAULT 'SUPPORT',
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN', "priority" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportTicket_kind_check" CHECK ("kind" IN ('SUPPORT','FEEDBACK')),
  CONSTRAINT "SupportTicket_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
  CONSTRAINT "SupportTicket_priority_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT'))
);
CREATE UNIQUE INDEX "SupportTicket_workspaceId_id_key" ON "SupportTicket"("workspaceId","id");
CREATE INDEX "SupportTicket_workspaceId_createdAt_id_idx" ON "SupportTicket"("workspaceId","createdAt","id");
CREATE INDEX "SupportTicket_status_priority_updatedAt_idx" ON "SupportTicket"("status","priority","updatedAt");

CREATE TABLE "SupportMessage" (
  "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "ticketId" UUID NOT NULL, "authorId" UUID NOT NULL,
  "body" VARCHAR(10000) NOT NULL, "internal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportMessage_workspaceId_ticketId_fkey" FOREIGN KEY ("workspaceId","ticketId") REFERENCES "SupportTicket"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SupportMessage_workspaceId_ticketId_createdAt_id_idx" ON "SupportMessage"("workspaceId","ticketId","createdAt","id");

CREATE TABLE "SupportNotification" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "workspaceId" UUID NOT NULL, "ticketId" UUID NOT NULL,
  "messageId" UUID NOT NULL, "readAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportNotification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportNotification_workspaceId_ticketId_fkey" FOREIGN KEY ("workspaceId","ticketId") REFERENCES "SupportTicket"("workspaceId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupportNotification_messageId_key" ON "SupportNotification"("messageId");
CREATE INDEX "SupportNotification_userId_readAt_createdAt_idx" ON "SupportNotification"("userId","readAt","createdAt");

CREATE TABLE "FinancialCost" (
  "id" UUID NOT NULL, "workspaceId" UUID, "category" VARCHAR(20) NOT NULL,
  "amountMicros" BIGINT NOT NULL, "incurredAt" TIMESTAMPTZ(3) NOT NULL,
  "sourceKey" VARCHAR(120) NOT NULL, "note" VARCHAR(500) NOT NULL,
  "actorId" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialCost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialCost_category_check" CHECK ("category" IN ('STORAGE','INFRASTRUCTURE')),
  CONSTRAINT "FinancialCost_amountMicros_check" CHECK ("amountMicros" >= 0),
  CONSTRAINT "FinancialCost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialCost_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialCost_sourceKey_key" ON "FinancialCost"("sourceKey");
CREATE INDEX "FinancialCost_category_incurredAt_idx" ON "FinancialCost"("category","incurredAt");
CREATE INDEX "FinancialCost_workspaceId_incurredAt_idx" ON "FinancialCost"("workspaceId","incurredAt");
