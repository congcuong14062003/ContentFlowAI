ALTER TABLE "Plan"
  ADD COLUMN "tier" VARCHAR(16) NOT NULL DEFAULT 'FREE',
  ADD COLUMN "cadence" VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "memberLimit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "brandLimit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "storageLimitBytes" BIGINT NOT NULL DEFAULT 104857600,
  ADD COLUMN "periodCredits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_tier_check" CHECK ("tier" IN ('FREE', 'STARTER', 'PRO', 'TEAM')),
  ADD CONSTRAINT "Plan_cadence_check" CHECK ("cadence" IN ('MONTHLY', 'YEARLY')),
  ADD CONSTRAINT "Plan_limits_check" CHECK ("memberLimit" BETWEEN 1 AND 10000 AND "brandLimit" BETWEEN 0 AND 1000 AND "storageLimitBytes" >= 0 AND "periodCredits" >= 0 AND "priceMinor" >= 0 AND "revision" >= 1);

ALTER TABLE "Subscription"
  ADD COLUMN "currentPeriodStart" TIMESTAMPTZ(3),
  ADD COLUMN "graceUntil" TIMESTAMPTZ(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Payment" ADD COLUMN "invoiceId" UUID;

CREATE TABLE "Invoice" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "periodStart" TIMESTAMPTZ(3) NOT NULL,
  "periodEnd" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_amountMinor_check" CHECK ("amountMinor" >= 0),
  CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'VOID', 'REFUNDED')),
  CONSTRAINT "Invoice_period_check" CHECK ("periodEnd" > "periodStart")
);

CREATE TABLE "SubscriptionEvent" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "planId" UUID NOT NULL,
  "periodStart" TIMESTAMPTZ(3),
  "periodEnd" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_invoiceId_key" ON "Payment"("invoiceId");
CREATE UNIQUE INDEX "Payment_workspaceId_invoiceId_key" ON "Payment"("workspaceId", "invoiceId");
CREATE UNIQUE INDEX "Invoice_workspaceId_id_key" ON "Invoice"("workspaceId", "id");
CREATE INDEX "Invoice_workspaceId_createdAt_id_idx" ON "Invoice"("workspaceId", "createdAt", "id");
CREATE INDEX "Invoice_workspaceId_subscriptionId_idx" ON "Invoice"("workspaceId", "subscriptionId");
CREATE INDEX "SubscriptionEvent_workspaceId_subscriptionId_createdAt_id_idx" ON "SubscriptionEvent"("workspaceId", "subscriptionId", "createdAt", "id");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_subscriptionId_fkey" FOREIGN KEY ("workspaceId", "subscriptionId") REFERENCES "Subscription"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_invoiceId_fkey" FOREIGN KEY ("workspaceId", "invoiceId") REFERENCES "Invoice"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_workspaceId_subscriptionId_fkey" FOREIGN KEY ("workspaceId", "subscriptionId") REFERENCES "Subscription"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
