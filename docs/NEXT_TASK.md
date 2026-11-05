# Next task

Phase 11 admin/dashboard subphase is implemented and tested; read PHASE_11.md, PHASE_10.md and PROJECT_STATE.md. The user explicitly authorized Phase 11. Keep it open: add safe provider/model/price revision management, per-workspace AI policy controls, business queue/worker heartbeat monitoring, durable notifications, richer user filters and admin billing operations. Use only real records; preserve secret references outside DB/API/logs. Run built SPA/CSP and admin mutation browser tests, then full gates and update checkpoint before Phase 11 signoff. Phase 07–10 remain incomplete with their own tracked gaps; do not silently mark them complete.

Phase 10 billing-core subphase now verified; see PHASE_10.md and PROJECT_STATE.md. The user has authorized Phase 10, but it is not complete. Preserve existing data and migrations. Next dependent slice: define payment provider adapter with verified signature/webhook event idempotency, invoice/payment reconciliation, then renewal/expiry/grace worker and period-end cancellation, upgrade/downgrade rules. Add real operator price config for Starter/Pro/Team only when supplied; do not invent prices. Build purchased-credit package/top-up and refund ledger after payment verification. Extend plan storage accounting across CatalogAsset and MediaAsset, feature/usage limits, admin UI and browser QA. Run migration/schema diff, full verify, real integration tests and update checkpoints at each safe boundary. Phase 09 Image Generator/Design Studio and Phase 07–08 acceptance remain open and should not be reported complete.

Phase 10 is now explicitly requested. Phase 07 and 08 remain incomplete, and Phase 09 has only the Media Library subphase implemented. Read MASTER_SPEC.md, PROJECT_STATE.md, PHASE_07.md, PHASE_08.md and PHASE_09.md. Preserve all existing data and applied migrations. Do not mark 07–09 complete while working on 10.

Next Phase 10 slice: inspect existing Plan/Subscription/Payment schema and CreditWalletService funding hooks, then implement server-owned plan catalog/entitlements/subscription state transitions and idempotent credit allocations with real DB tests. Keep payment success untrusted until verified provider webhook or audited administrator confirmation; no provider credentials are configured. Coordinate storage entitlement with PHASE_09.md media quota. Update checkpoint after each safe slice.

Latest user-requested UI correction: shared AppShell content frame and Brand/Product list layout fixed; web Docker container rebuilt and healthy. 14 development /13 built browser scenarios passed before the final localized empty-state copy tweak; that tweak passed lint/web build. Continue Phase 07/08 functional acceptance below when requested, without treating this UI correction as phase signoff.

Immediate next steps: finish Phase 08 acceptance from PHASE_08.md. Move Content updates behind its public service boundary; implement campaign assignees, content workflow UI, full calendar grids/drag/drop, calendar content creation, filters and duplicate schedule handling. Add durable idempotent upcoming reminders, manual publishing copy/download and audit history. Test timezone edge cases, concurrent changes, RBAC/tenant isolation and browser flows. Run build/lint/typecheck/tests and update checkpoints before Phase 08 signoff. Phase 07 remaining work remains in PHASE_07.md.

Evidence: ten additive migrations applied after one failed enum attempt was marked rolled back; schema diff exit0. Full verify passed 42 unit/component +3 skipped and five builds. Real PostgreSQL/Redis generator/campaign integration 13/13 passed. No Phase 08 browser test or final Docker image rebuild. Do not present the current list range UI as a full calendar grid.

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
