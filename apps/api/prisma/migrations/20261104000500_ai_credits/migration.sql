BEGIN;
-- AlterEnum
ALTER TYPE "GenerationStatus" ADD VALUE 'UNKNOWN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'RESERVE';
ALTER TYPE "LedgerKind" ADD VALUE 'RELEASE';
ALTER TYPE "LedgerKind" ADD VALUE 'EXPIRY';

-- AlterTable
ALTER TABLE "AiGeneration" ADD COLUMN     "deadlineAt" TIMESTAMPTZ(3),
ADD COLUMN     "dispatchedAt" TIMESTAMPTZ(3),
ADD COLUMN     "estimatedMicros" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "fingerprint" VARCHAR(64),
ADD COLUMN     "pricing" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "providerRequestId" VARCHAR(200),
ADD COLUMN     "spendDay" DATE,
ADD COLUMN     "taskType" VARCHAR(40);

-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN     "reservedDelta" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CreditReservation" ADD COLUMN     "refundedAt" TIMESTAMPTZ(3),
ADD COLUMN     "settledAmount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "source" VARCHAR(24) NOT NULL,
    "amount" BIGINT NOT NULL,
    "remaining" BIGINT NOT NULL,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3),
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAllocation" (
    "workspaceId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "consumed" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "CreditAllocation_pkey" PRIMARY KEY ("workspaceId","reservationId","grantId")
);

-- CreateTable
CREATE TABLE "AiPolicy" (
    "key" VARCHAR(80) NOT NULL,
    "workspaceId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyCapMicros" BIGINT NOT NULL DEFAULT 0,
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 10,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "AiPolicy_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AiSpendBucket" (
    "scope" VARCHAR(80) NOT NULL,
    "day" DATE NOT NULL,
    "spentMicros" BIGINT NOT NULL DEFAULT 0,
    "reservedMicros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "AiSpendBucket_pkey" PRIMARY KEY ("scope","day")
);

-- CreateTable
CREATE TABLE "AiRateWindow" (
    "workspaceId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "AiRateWindow_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "AiProviderHealth" (
    "provider" VARCHAR(50) NOT NULL,
    "healthy" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "errorCode" VARCHAR(80),

    CONSTRAINT "AiProviderHealth_pkey" PRIMARY KEY ("provider")
);

-- CreateIndex
CREATE INDEX "CreditGrant_workspaceId_expiresAt_createdAt_id_idx" ON "CreditGrant"("workspaceId", "expiresAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CreditGrant_workspaceId_id_key" ON "CreditGrant"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CreditGrant_workspaceId_idempotencyKey_key" ON "CreditGrant"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditAllocation_workspaceId_grantId_idx" ON "CreditAllocation"("workspaceId", "grantId");

-- CreateIndex
CREATE UNIQUE INDEX "AiPolicy_workspaceId_key" ON "AiPolicy"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReservation_workspaceId_id_key" ON "CreditReservation"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "CreditAccount"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_workspaceId_reservationId_fkey" FOREIGN KEY ("workspaceId", "reservationId") REFERENCES "CreditReservation"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_workspaceId_grantId_fkey" FOREIGN KEY ("workspaceId", "grantId") REFERENCES "CreditGrant"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPolicy" ADD CONSTRAINT "AiPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve history; fail closed rather than fabricate allocations for legacy in-flight funds.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CreditAccount" a WHERE a.reserved <> 0 OR a.balance <> COALESCE((SELECT SUM(e.amount) FROM "CreditLedgerEntry" e WHERE e."accountId" = a.id),0))
 OR EXISTS (SELECT 1 FROM "CreditReservation") THEN
  RAISE EXCEPTION 'Legacy wallet requires explicit reconciliation before AI credit migration';
 END IF;
END $$;
INSERT INTO "CreditGrant" (id,"workspaceId","accountId",source,amount,remaining,"idempotencyKey",fingerprint,reference)
 SELECT id,"workspaceId",id,'LEGACY',balance,balance,'legacy-' || id::text,repeat('0',64),'Preserved pre-gateway balance' FROM "CreditAccount" WHERE balance > 0;
ALTER TABLE "CreditLedgerEntry" DROP CONSTRAINT "CreditLedgerEntry_nonzero", DROP CONSTRAINT "CreditLedgerEntry_direction";
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_nonzero" CHECK (amount <> 0 OR "reservedDelta" <> 0),
 ADD CONSTRAINT "CreditLedgerEntry_direction" CHECK (
 (kind::text IN ('GRANT','PURCHASE','REFUND') AND amount > 0 AND "reservedDelta" = 0) OR
 (kind::text = 'USAGE' AND amount < 0 AND "reservedDelta" < 0) OR
 (kind::text = 'RESERVE' AND amount = 0 AND "reservedDelta" > 0) OR
 (kind::text = 'RELEASE' AND amount = 0 AND "reservedDelta" < 0) OR
 (kind::text = 'EXPIRY' AND amount < 0 AND "reservedDelta" = 0) OR
 (kind::text = 'ADJUSTMENT' AND amount <> 0 AND "reservedDelta" = 0));
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_funds" CHECK (amount > 0 AND remaining BETWEEN 0 AND amount AND reserved BETWEEN 0 AND remaining),
 ADD CONSTRAINT "CreditGrant_source" CHECK (source IN ('SUBSCRIPTION','PURCHASE','PROMOTIONAL','ADMIN','LEGACY'));
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_amount" CHECK (amount > 0 AND consumed BETWEEN 0 AND amount);
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_settlement" CHECK ("settledAmount" BETWEEN 0 AND amount AND (status = 'SETTLED' OR "settledAmount" = 0) AND ("refundedAt" IS NULL OR status = 'SETTLED'));
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_estimate" CHECK ("estimatedMicros" >= 0);
ALTER TABLE "AiPolicy" ADD CONSTRAINT "AiPolicy_limits" CHECK ("dailyCapMicros" >= 0 AND "requestsPerMinute" BETWEEN 1 AND 1000 AND "maxConcurrent" BETWEEN 1 AND 20),
 ADD CONSTRAINT "AiPolicy_scope" CHECK ((key = 'global' AND "workspaceId" IS NULL) OR ("workspaceId" IS NOT NULL AND key = 'workspace:' || "workspaceId"::text));
ALTER TABLE "AiSpendBucket" ADD CONSTRAINT "AiSpendBucket_nonnegative" CHECK ("spentMicros" >= 0 AND "reservedMicros" >= 0);
ALTER TABLE "AiRateWindow" ADD CONSTRAINT "AiRateWindow_count" CHECK (count > 0);
CREATE FUNCTION protect_grant_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Grant history is retained'; END IF;
 IF ROW(OLD.id, OLD."workspaceId", OLD."accountId", OLD.source, OLD.amount, OLD."expiresAt", OLD."idempotencyKey", OLD.fingerprint, OLD.reference, OLD."createdAt") IS DISTINCT FROM
 ROW(NEW.id, NEW."workspaceId", NEW."accountId", NEW.source, NEW.amount, NEW."expiresAt", NEW."idempotencyKey", NEW.fingerprint, NEW.reference, NEW."createdAt") THEN
  RAISE EXCEPTION 'Grant origin is immutable';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER credit_grant_origin BEFORE UPDATE OR DELETE ON "CreditGrant" FOR EACH ROW EXECUTE FUNCTION protect_grant_origin();

-- Deferred cross-row accounting checks run at commit, allowing atomic multi-row journal operations.
CREATE FUNCTION check_wallet_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid UUID; a "CreditAccount"%ROWTYPE; lot_balance BIGINT; lot_reserved BIGINT; held BIGINT; journal_balance BIGINT; journal_reserved BIGINT;
BEGIN
 IF TG_TABLE_NAME = 'CreditAccount' THEN aid := NEW.id;
 ELSIF TG_TABLE_NAME = 'CreditAllocation' THEN SELECT "accountId" INTO aid FROM "CreditReservation" WHERE id = NEW."reservationId";
 ELSE aid := NEW."accountId"; END IF;
 SELECT * INTO a FROM "CreditAccount" WHERE id = aid FOR UPDATE;
 SELECT COALESCE(SUM(remaining),0),COALESCE(SUM(reserved),0) INTO lot_balance,lot_reserved FROM "CreditGrant" WHERE "accountId" = aid;
 SELECT COALESCE(SUM(amount),0) INTO held FROM "CreditReservation" WHERE "accountId" = aid AND status = 'HELD';
 SELECT COALESCE(SUM(amount),0),COALESCE(SUM("reservedDelta"),0) INTO journal_balance,journal_reserved FROM "CreditLedgerEntry" WHERE "accountId" = aid;
 IF a.balance <> lot_balance OR a.reserved <> lot_reserved OR a.reserved <> held OR a.balance <> journal_balance OR a.reserved <> journal_reserved THEN
  RAISE EXCEPTION 'Wallet journal invariant violated' USING ERRCODE = '23514';
 END IF;
 IF EXISTS (SELECT 1 FROM "CreditReservation" r WHERE r."accountId" = aid AND r.amount <> COALESCE((SELECT SUM(x.amount) FROM "CreditAllocation" x WHERE x."reservationId" = r.id),0)) THEN
  RAISE EXCEPTION 'Reservation allocation invariant violated' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER wallet_journal_account AFTER INSERT OR UPDATE ON "CreditAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_journal();
CREATE CONSTRAINT TRIGGER wallet_journal_grant AFTER INSERT OR UPDATE ON "CreditGrant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_journal();
CREATE CONSTRAINT TRIGGER wallet_journal_reservation AFTER INSERT OR UPDATE ON "CreditReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_journal();
CREATE CONSTRAINT TRIGGER wallet_journal_entry AFTER INSERT ON "CreditLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_journal();
CREATE CONSTRAINT TRIGGER wallet_journal_allocation AFTER INSERT OR UPDATE ON "CreditAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_journal();

ALTER TABLE "AiSpendBucket" ADD CONSTRAINT "AiSpendBucket_scope_fkey" FOREIGN KEY (scope) REFERENCES "AiPolicy"(key) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiRateWindow" ADD CONSTRAINT "AiRateWindow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_ai_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(OLD.id, OLD."workspaceId", OLD."idempotencyKey", OLD.fingerprint, OLD.provider, OLD.model, OLD.pricing, OLD."estimatedMicros", OLD."spendDay", OLD."taskType", OLD.input, OLD."createdAt") IS DISTINCT FROM
 ROW(NEW.id, NEW."workspaceId", NEW."idempotencyKey", NEW.fingerprint, NEW.provider, NEW.model, NEW.pricing, NEW."estimatedMicros", NEW."spendDay", NEW."taskType", NEW.input, NEW."createdAt") THEN
 RAISE EXCEPTION 'AI intent/pricing snapshot is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER ai_intent_immutable BEFORE UPDATE ON "AiGeneration" FOR EACH ROW EXECUTE FUNCTION protect_ai_intent();
CREATE FUNCTION protect_credit_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reservation history is retained'; END IF;
 IF ROW(OLD.id,OLD."workspaceId",OLD."accountId",OLD."generationId",OLD.amount,OLD."expiresAt",OLD."createdAt") IS DISTINCT FROM
 ROW(NEW.id,NEW."workspaceId",NEW."accountId",NEW."generationId",NEW.amount,NEW."expiresAt",NEW."createdAt") THEN RAISE EXCEPTION 'Reservation origin is immutable'; END IF;
 IF OLD.status <> 'HELD' AND (OLD.status <> NEW.status OR OLD."settledAmount" <> NEW."settledAmount") THEN RAISE EXCEPTION 'Reservation settlement is final'; END IF;
 IF OLD."refundedAt" IS NOT NULL AND OLD."refundedAt" IS DISTINCT FROM NEW."refundedAt" THEN RAISE EXCEPTION 'Refund decision is final'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_reservation_origin BEFORE UPDATE OR DELETE ON "CreditReservation" FOR EACH ROW EXECUTE FUNCTION protect_credit_reservation();
CREATE FUNCTION protect_credit_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Allocation history is retained'; END IF;
 IF ROW(OLD."workspaceId",OLD."reservationId",OLD."grantId",OLD.amount) IS DISTINCT FROM ROW(NEW."workspaceId",NEW."reservationId",NEW."grantId",NEW.amount)
 OR (OLD.consumed <> NEW.consumed AND NOT EXISTS (SELECT 1 FROM "CreditReservation" r WHERE r.id = OLD."reservationId" AND r.status = 'HELD')) THEN
 RAISE EXCEPTION 'Allocation origin/settled consumption is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER credit_allocation_origin BEFORE UPDATE OR DELETE ON "CreditAllocation" FOR EACH ROW EXECUTE FUNCTION protect_credit_allocation();
COMMIT;
