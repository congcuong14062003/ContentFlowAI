# Next task

Phase 00–06 local implementation is complete. User explicitly authorized Phase 07–10 together on 2026-11-05. Work sequentially through safe subphases and do not claim all four complete. Phase 07 revision backend foundation is in progress; full Phase 07 UI/AI/test gates and all Phase 08–10 work remain.

Immediate next steps: verify Prisma schema diff, finish full host lint/typecheck with a supported npm CLI, and add browser coverage for editor. Migration 20261105000700_content_revisions has been applied and repeat deployment has no pending migrations. The new content API save/stale version/restore/role/tenant cases passed in test:generator (12/12). Then implement TipTap editor, autosave/conflict UI, revisions, library, template/export/preview and paid AI text actions through Credit Engine. Complete Phase 07 acceptance and checkpoint before Phase 08. Phase 08 workflow/calendar/manual publishing, Phase 09 media/image/studio and Phase 10 billing follow in that order.

Current evidence: Prisma generation, API build/typecheck and targeted ESLint passed; Compose rebuilt source and all long-running services healthy, test:stack passed, migration 8 applied/repeated, test:generator 12/12 passed with real PostgreSQL/Redis. Full host verify failed because global npm CLI is 6.14.18 and mishandles workspace flags; no editor browser tests yet. See PROJECT_STATE. Do not rewrite applied migrations or delete existing data.

Read MASTER_SPEC.md, PROJECT_STATE.md, PHASE_06.md and this file before further work. Seven migrations are applied; existing files are immutable. Use additive migrations only. Private source/prompt snapshots and initial drafts are real persisted data, never reset/truncate them for development.

## Running local stack

Web http://localhost:5173; generator http://localhost:5173/app/create; API http://localhost:53000/api/v1; Swagger http://localhost:53000/api/docs. All six long-running services healthy; migration/storage-init exit0; PostgreSQL/Redis/S3 readiness200. Host API port53000 preserves another project's port3000; container API remains3000. Private mailbox .local/mail; S3 console http://localhost:59001. Volumes and unrelated services preserved.

Node22.22.2 within22.x. Use ./scripts/npm.ps1 on this Windows host. Finish host API/DB tests before db:generate/verify replaces the Prisma DLL.

## Phase 06 handoff

/app/create uses workspace query parameter and optional runId bookmark. Twelve API-driven tools have dedicated validated forms and strict version-1 JSON outputs. GeneratorQuote freezes normalized input, prompt/source context and pricing fingerprint for five minutes. Creation accepts quoteId + operation key only; quote is consumed once. Replays/restores use deterministic internal gateway key; changed pricing/expired quote never dispatches. Request/financial intent/result/draft links are tenant-scoped and retained immutably.

AiGatewayService now accepts a trusted server output contract. Known-usage invalid schema is settled then compensated atomically; provider spend/AiUsage remain recorded and user refund keeps original grant expiry. UNKNOWN still retains worst-case credit/spend until Phase05 reconciliation. No blind paid retry. BILLED lost output becomes OUTPUT_UNAVAILABLE and cannot be saved.

Save per variation creates existing Content DRAFT/version1 and immutable ContentRevision1 through ContentDraftService; GeneratedDraft links run/variation/content idempotently. Document body schemaVersion1/kind=generated_marketing carries tool/language/platform, variation, warnings and sourceRunId. Current UI only reads saved drafts. Phase07 can build on that contract when authorized. Preserve version1 restore schemas/templates if generator definitions evolve.

## Actual final checks

- verify exit0: generation, zero-warning lint, typecheck, 42 default unit/component passed +3 opt-in skipped, five production workspace builds.
- test:generator: 11 scenarios; all12 tools through real PostgreSQL/Redis and local HTTP protocol fixture, including context, credits, invalid-output refund, duplicate/save/restore, stale price/expiry, tenant and Nest application restart.
- test:finance23, test:integration45/45, test:auth17, test:catalog10 passed.
- Browser13 dev /12 built SPA-CSP passed; actual clipboard/save/regenerate, refund, mobile and lost-response recovery verified.
- Seven migrations deployed and repeated with no pending; Prisma schema diff no differences.
- Full Docker source build and test:stack passed: six healthy services, init jobs exit0, live/ready/web200 and DTO400.
- CI includes generator and extended browser gates; hosted execution not claimed.

Tests allocate isolated schemas/ports/mailboxes/object keys. AI fixtures are only under scripts/tests and do not supply production responses. Browser test scenarios isolate their own auth-throttle namespace; production guards are unchanged. Test routes only drop one acknowledged POST response, then restore with the same key.

## External activation and limits

Running API checked AI_ENABLED=false/zero configured models. No generating vendor calls made. Operator must inject real credentials/reviewed pinned routes/prices/limits, enable global+workspace policies and fund credits. Model limits must fit serialized context and tool.outputTokens × variation count; no model/price is fabricated or automatically selected. Live output quality/factual accuracy and invoice reconciliation are not established by fixture tests.

Quotes persist private source/prompts; apply production retention/backups accordingly. Prompt policy forbids invented statistics/testimonials/claims; JSON validation is not semantic fact verification. Durable BullMQ generation dispatch, advanced editor, social publishing, payments/subscription activation, actual SMTP/Google activation, load/alerts/public deployment remain future/external scope. Existing Phase10 asset lifecycle boundaries remain in PHASE_04.md.
