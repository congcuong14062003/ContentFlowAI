BEGIN;
-- CreateTable
CREATE TABLE "GeneratorQuote" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "toolId" VARCHAR(50) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "input" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratorRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "aiGenerationId" UUID,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GeneratorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDraft" (
    "workspaceId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "variationIndex" INTEGER NOT NULL,
    "contentId" UUID NOT NULL,

    CONSTRAINT "GeneratedDraft_pkey" PRIMARY KEY ("workspaceId","runId","variationIndex")
);

-- CreateIndex
CREATE INDEX "GeneratorQuote_workspaceId_actorId_createdAt_id_idx" ON "GeneratorQuote"("workspaceId", "actorId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorQuote_workspaceId_id_key" ON "GeneratorQuote"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_quoteId_key" ON "GeneratorRun"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_aiGenerationId_key" ON "GeneratorRun"("aiGenerationId");

-- CreateIndex
CREATE INDEX "GeneratorRun_workspaceId_createdAt_id_idx" ON "GeneratorRun"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_workspaceId_id_key" ON "GeneratorRun"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_workspaceId_quoteId_key" ON "GeneratorRun"("workspaceId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_workspaceId_aiGenerationId_key" ON "GeneratorRun"("workspaceId", "aiGenerationId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratorRun_workspaceId_idempotencyKey_key" ON "GeneratorRun"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDraft_contentId_key" ON "GeneratedDraft"("contentId");

-- AddForeignKey
ALTER TABLE "GeneratorQuote" ADD CONSTRAINT "GeneratorQuote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratorRun" ADD CONSTRAINT "GeneratorRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratorRun" ADD CONSTRAINT "GeneratorRun_workspaceId_quoteId_fkey" FOREIGN KEY ("workspaceId", "quoteId") REFERENCES "GeneratorQuote"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratorRun" ADD CONSTRAINT "GeneratorRun_workspaceId_aiGenerationId_fkey" FOREIGN KEY ("workspaceId", "aiGenerationId") REFERENCES "AiGeneration"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDraft" ADD CONSTRAINT "GeneratedDraft_workspaceId_runId_fkey" FOREIGN KEY ("workspaceId", "runId") REFERENCES "GeneratorRun"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDraft" ADD CONSTRAINT "GeneratedDraft_workspaceId_contentId_fkey" FOREIGN KEY ("workspaceId", "contentId") REFERENCES "Content"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "GeneratorRun" ADD CONSTRAINT "GeneratorRun_status" CHECK (status IN ('PENDING','RESERVED','RUNNING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED','INVALID_OUTPUT','OUTPUT_UNAVAILABLE'));
ALTER TABLE "GeneratedDraft" ADD CONSTRAINT "GeneratedDraft_variation" CHECK ("variationIndex" BETWEEN 0 AND 4);
CREATE TRIGGER generator_quote_immutable BEFORE UPDATE OR DELETE ON "GeneratorQuote" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_generator_run() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Generation history is retained'; END IF;
 IF ROW(OLD.id,OLD."workspaceId",OLD."actorId",OLD."quoteId",OLD."idempotencyKey",OLD."createdAt") IS DISTINCT FROM ROW(NEW.id,NEW."workspaceId",NEW."actorId",NEW."quoteId",NEW."idempotencyKey",NEW."createdAt") THEN RAISE EXCEPTION 'Generation request origin is immutable'; END IF;
 IF OLD."aiGenerationId" IS NOT NULL AND OLD."aiGenerationId" IS DISTINCT FROM NEW."aiGenerationId" THEN RAISE EXCEPTION 'Generation intent binding is immutable'; END IF;
 IF OLD.result IS NOT NULL AND OLD.result IS DISTINCT FROM NEW.result THEN RAISE EXCEPTION 'Generated result is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generator_run_origin BEFORE UPDATE OR DELETE ON "GeneratorRun" FOR EACH ROW EXECUTE FUNCTION protect_generator_run();
CREATE TRIGGER generated_draft_link_immutable BEFORE UPDATE OR DELETE ON "GeneratedDraft" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
COMMIT;
