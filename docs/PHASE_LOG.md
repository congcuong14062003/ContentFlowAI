# Phase log

## 2026-11-05 — Email verification code correction

Replaced new-account email link with a 10-minute, six-digit code and a code-entry UI. Added HMAC token storage, resend invalidation, attempt limit, legacy-link compatibility and auth/browser fixture updates. Full verify and 18 real HTTP auth scenarios passed; local API/web rebuilt. SMTP outbox published a new code for the sole pending configured account.

## 2026-11-05 — Phase 13 collaboration/notifications checkpoint

Added additive migration 14, collaboration and notification API modules, content/workspace/support event hooks, worker event scans, web notification center/settings and content/team collaboration interfaces. Full verify passed; disposable PostgreSQL migration/schema diff passed. Real integration fixture exercises authorization, dedupe, realtime reconnect and background events. Remaining acceptance is in `PHASE_13.md`.

## 2026-11-05 — Phase 12 financial analytics/support checkpoint

Added additive migration 13, finance aggregation/cost entry/CSV API and admin charts, plus tenant-safe support tickets, replies, notes, history and in-app notifications with separate user/admin UI. `docs/PHASE_12.md` records definitions and remaining scope. Full verify passed 47 tests +3 opt-in skips/five builds; isolated PostgreSQL migration/schema diff and finance/support fixture passed. No browser/live HTTP or production deployment claim. Phase 12 remains partial.

## 2026-11-05 — Phase 11 admin/dashboard checkpoint

Added independent admin shell/routes, genuine PostgreSQL/BullMQ overview and ECharts visualizations, system-admin-protected user search/details/suspension and AI policy/provider/usage operations. No synthetic production metrics or secret fields. Changed: `apps/api/src/admin/*`, `apps/api/src/{app.module.ts,ai/ai-policy.service.ts,ai/ai.controller.ts}`, `apps/web/src/{layouts/AdminShell.vue,features/admin/*,app/router.ts,locales/{vi,en}.ts,styles/tokens.css}`, web/API package manifests and lock, `scripts/test-admin.mjs`, `scripts/test-browser.mjs`, root package scripts and checkpoint docs. Removed unused placeholder `AdminPage.vue`. No database migration.

Checks: final full verify exit0 after all source changes; real isolated PostgreSQL/Redis admin integration 5/5; development Chromium 16/16 including admin desktop/mobile. First admin integration run found a test assertion that mistook `inputTokens` for private `input`; fixed and final 5/5 passed. First desktop-to-mobile browser run asserted before ECharts ResizeObserver settled; final run waits 250 ms and passed. Dev Docker API/web rebuilt; six long-running services healthy, migration/storage-init exited 0, live/ready/web-admin=200, anonymous admin API=401. Phase 11 incomplete; see PHASE_11.md.

## 2026-11-05 — Phase 10 billing-core checkpoint

Implemented additive billing schema/migration 12, idempotent Free or pending paid subscription request, invoices/payment records, admin manual confirmation with evidence and atomic credit grant/entitlements, cancellation records, member invitation limit, protected APIs and connected vi/en billing page. Paid provider and renewal/top-up functionality remain open in PHASE_10.md. Preserved existing migrations and data. Files: `apps/api/prisma/{schema.prisma,seed.ts,migrations/20261105001000_billing_core/migration.sql}`, `apps/api/src/billing/*`, `apps/api/src/{app.module.ts,workspaces/workspace.service.ts,catalog/catalog.service.ts,media/media.service.ts}`, `apps/web/src/{features/billing/BillingPage.vue,app/router.ts,layouts/AppShell.vue,locales/{vi,en}.ts}`, `scripts/test-billing.mjs`, `package.json`, checkpoint docs.

Actual checks: local migration and Prisma schema diff, repeated seed, full verify exit0 with 42 passed/3 skipped tests and five builds, six real PostgreSQL/API billing scenarios passed. No live payment or browser/Docker billing acceptance claimed. Phase 10 not complete; earlier Phase 07–09 gaps unchanged.

## 2026-11-04 — Phase 00–03 completion / acceptance closure

Closed the outstanding implementation items: source-built pinned official MinIO replaces unavailable prebuilt tags; full normal Docker dependency startup has all six services healthy and migration/bucket jobs exit 0. Real S3 PUT/GET/private access and API readiness=200 passed. Project/Docker/CI now use Node 22.22.2; reviewed compatible lint/test tooling patches and npm audit fix without force leave full/production npm audit at zero findings (also confirmed by cold Docker npm ci).

Added scoped keyset pagination to workspace/member/invitation/session APIs, visible UI load-more and switcher paging, additive pagination/outbox indexes, cross-tab Web Locks/BroadcastChannel session handling, transactional encrypted email outbox with worker recovery/stable job IDs, and identity public profile projection. Dev API now compiles with tsc/Node watch so Nest DTO metadata/validation actually apply in development; live Docker invalid-body test returns 400 before persistence.

Verification: full verify passed; 31 real-dependency/unit/component tests passed (default 28 + 3 opt-in skipped); 17 HTTP security cases passed, including 105-workspace cursor traversal, outbox rollback/recovery, roles/IDOR and refresh replay. Chromium: 9 development and 8 built-SPA/CSP scenarios passed, including pagination and two-tab refresh. Positive and negative TLS SMTP protocol acceptance passed; OAuth signed-identity and PKCE/state/nonce/token-exchange contract fixtures passed. These are adapter contracts, not claims of actual Google consent or external inbox delivery. Real vendor credentials are operator activation configuration and are not present locally.

Actual graceful API/worker/web stop and normal restart passed without removing volumes; worker logged clean stop. Production Node/Nginx images built. Migration deploy repeated safely with all 3 migrations applied. No Phase 04+, AI or billing business handler added.

QA correction: an interrupted browser run reused the dev port and created one unverified local synthetic account. It was identified exactly, verified to have no sessions/memberships, disabled and audited; no account/history was deleted. Browser harness now allocates an ephemeral port and verifies a per-run server marker before interacting, in addition to isolated database schema/mailbox cleanup.

Changed files: infrastructure/storage.Dockerfile, app Dockerfile/Compose, Node version markers, package manifests/lock/tooling/CI; API pagination/identity/workspace/outbox/index migration; shared mail dispatcher/TLS config; worker DB/outbox lifecycle; web paged queries/session sync/UI; dev/startup/storage/SMTP/browser/HTTP scripts and all checkpoints. Current inventory is FILES_CHANGED.md. Project is ready for the next user-specified phase; no next phase starts automatically.

## 2026-11-04 — Phase 02 and Phase 03 implementation checkpoint

User explicitly authorized proceeding with UI/auth/workspaces despite the existing S3 acceptance gap. Implemented Vue Router/Pinia/TanStack Query/Tailwind/i18n, semantic dark/light glass tokens, responsive shell and administrator navigation, accessible primitives/showcase and connected auth/profile/workspace/session/invitation pages. No fake production records, metrics or future business handlers.

Backend: identity and workspace modules, additive session access-digest migration, scrypt hashing, email verification/reset, refresh family rotation/replay/concurrency protection, Origin validation, Redis throttling, backend tenant/role enforcement, Google OAuth configuration adapter, one-time verified-admin bootstrap and audited sensitive mutations. Shared packages/mail supplies AES-GCM encrypted BullMQ payloads, retrying SMTP/development-mail worker delivery, with production local-mail refusal. Existing migrations and data preserved.

Actual checks: full verify (generate/lint/typecheck/unit/component/build) passed; 28/28 tests passed with real PostgreSQL/Redis; 15 real HTTP security scenarios passed including actual bootstrap and concurrent refresh; 7 development Chromium scenarios passed. Built production SPA additionally passed 6 Chromium scenarios under CSP/same-origin proxy. Native focus wrapping and request-ID header regressions discovered during testing were corrected and rerun. Screenshots captured and dark desktop/light mobile visually inspected; no page overflow at 1440/768/390px.

Node/Nginx production images built with mail workspace; production dependency audit returned zero vulnerabilities. No image push, public deployment, hosted CI result, actual Google exchange or external SMTP delivery claimed. Full audit retains 12 moderate tooling findings; Node minor engine warning and Phase 01 S3 gap remain. Lists are bounded to 100 and email enqueue has a resend-recoverable database-to-queue gap. Details and remaining hardening are in PROJECT_STATE/NEXT_TASK.

Changed paths: apps/web/src/{app,components,features,layouts,lib,locales,styles}, web Vite/package configuration; apps/api/src/{identity,workspaces,audit,common,platform,config}, app/bootstrap; Prisma schema/new migration; apps/worker/src/main.ts; packages/mail; root scripts/config/lockfile, infrastructure, CI and all checkpoint documents. Full inventory is in FILES_CHANGED.md. Phase 04 not started or authorized.

Final rerun after all source changes: verify exit 0; 15/15 HTTP scenarios, 7/7 development browser scenarios and 6/6 built-SPA browser scenarios passed. Both final production image builds exited 0. Repeat migrate deploy had no pending migration. PostgreSQL read-back confirmed zero remaining generated test schemas. Checkpoints saved; local PostgreSQL/Redis retained for development, temporary API/Vite/Chromium processes closed.

## 2026-11-04 — Phase 00 complete

Initial inspection: empty directory, no package files/checkpoints/Git metadata. Created npm workspace skeleton and fixed architecture documentation. Stack retained as requested. No future domain handlers or fake data introduced.

Changed files: root package/config/ignore files; apps/{api,web,worker}/package.json and TypeScript entry/config files; packages/shared; docs/{MASTER_SPEC,DATABASE,API_CONTRACTS,ROADMAP,PROJECT_STATE,PHASE_LOG,NEXT_TASK}. Detailed final file inventory is maintained in FILES_CHANGED.md.

Consistency reviewed: system roles separate from workspace roles, tenant-scoped composite references, append-only integer credit ledger, outbox, ownership policy, shared contracts without backend imports, route groups and same-origin production proxy.

## 2026-11-04 — Phase 01A foundation subphase checkpoint

Added infrastructure, Prisma initial migration and invariants, configuration seed, Nest platform/health/HTTP behavior, BullMQ worker, tests, CI and development scripts. No business endpoints implemented. Changed files are listed in FILES_CHANGED.md.

Actual verification: lint/typecheck/build passed; real integration run 14/14 tests passed across 5 files (11 unit, 3 integration). Migration deploy ran twice successfully; seed ran twice successfully. Compiled Nest HTTP smoke passed liveness/request ID/404/Swagger/error sanitization and app resource close; ready=503 because object storage is unavailable. API/worker/web development images and Node/Nginx production images built. Actual API and web HTTP returned 200; worker/PostgreSQL/Redis healthy. Nginx syntax and configured production-runtime imports passed. Compose dev/prod configuration validation passed. Controlled stop preserved all volumes and confirmed worker shutdown.

Corrections during verification: composite Prisma unique keys, transient logger resolution, explicit dev DI tokens, IPv4 service URLs, protected credential-free error handling, patched transitive runtime dependencies. The final production npm audit returned zero vulnerabilities; full audit retains 9 moderate tooling findings, plus a Node 22.12/visitor-keys engine warning.

Remaining acceptance: obtain working official MinIO images (Docker Hub denied pulls; Quay returned 401), initialize bucket and verify real S3, run normal dependency-gated full Compose startup/readiness=200, production-mode runtime smoke, align Node minor/tooling. No CI server run or browser visual review claimed. Phase 01 overall remains incomplete. Phase 02 and 03 have not started. Follow NEXT_TASK.md; no Phase 04+ authorized.

Final gate after all source changes: `npm run verify` exited 0 (generate, lint, workspace/test typecheck, 11 unit tests passed + 3 opt-in integrations skipped, full workspace build). The separate real integration run above passed all 14 tests before dependency containers were stopped. All four required checkpoint files updated at this boundary.

## 2026-11-04 — Phase 04 complete

User explicitly authorized Brand Kit & Product Catalog. Added additive migration 20261104000400_brand_catalog, catalog feature/API/DTO/runtime context schema, exported workspace authorization, private S3 object operations, versioned shared contracts, technical entitlement enforcement and privileged provisioning CLI, Vue brand wizard/detail/default/logo/assets and product forms/archive/association/filter/paging, multiline controls, vi/en strings and role/error states. No AI/billing business handlers. See PHASE_04.md and FILES_CHANGED.md for boundaries/full changed paths.

Actual tests: verify exit 0 (generation/lint/typecheck, 33 unit/component passed + 3 opt-in skipped, five production workspace builds); final lint/typecheck/test rerun passed after test/port updates. test:catalog 10 real HTTP/PostgreSQL/Redis/S3 scenarios passed; test:auth 17 passed; development browser 10 and built SPA/CSP browser 9 passed. Private image browser decode/owned logo, wizard persistence, association/archive/search and mobile overflow checked. Desktop screenshot visually inspected. Migration applied on existing development DB; repeat no pending; migrate diff no differences. Fresh test schemas deploy twice. Full Docker six services healthy, init jobs exit 0; test:stack readiness/live/web=200 and dev validation=400 passed. CI S3 config validated; hosted CI not claimed.

Corrections/evidence: first local DB test could not connect before services were started; Docker access/Vitest cache required approved escalation. Approval became available and subsequent tests executed successfully. Early browser attempts stopped on ambiguous test selectors and a URL matcher that also matched /new; corrected to scoped controls and UUID detail URL, then dev/production runs passed. Full stack first hit unrelated study-en-app on port 3000; added configurable API_HOST_PORT and selected free local 53000, leaving unrelated services running. Original migrations/data were not deleted or rewritten. Earlier history.state secret-fragment fix is now reverified in browser.

Known boundaries: technical brand allowance is operator provisioned until Phase 11. Soft-removal retains private objects; lifecycle policy and Phase 10 orphan/PENDING reconciliation remain future operations. Image signature/header policy is not a malware scanner/re-encoder. Actual vendor SMTP/Google activation, hosted CI/public deployment not performed. No known failed Phase 04 acceptance gate remains. All four checkpoint files updated; wait for explicit Phase 05 prompt.

## 2026-11-04 — Phase 05 AI Provider Gateway & Credit Engine complete

Explicit user prompt superseded the original Phase 05 content-editor slot. Implemented credit wallet/grants/allocations/reservations, immutable balance+hold journal, FEFO expiry/refund, funding-event uniqueness, audited system-admin grants/adjustments/refunds/reconciliation; AI abstraction and real OpenAI-compatible text/fixed-price image HTTP adapter, server routing/pricing snapshots, bounded token/input/response handling, cancellation/unknown policy, health, global/workspace spend caps/kill, rate/concurrency admission and crash recovery. Added minimal real read-only credit UI and shared decimal-string contracts; no Content Generator, payment flow or generation queue. PHASE_05.md records full contracts/activation and FILES_CHANGED.md lists paths.

Final actual results: verify exit 0 (generation, zero-warning lint, all typechecks, 36 unit/component tests passed + 3 opt-in skipped, five workspace builds); test:finance 23 real PostgreSQL + HTTP protocol-fixture scenarios passed; test:integration 39/39 PostgreSQL/Redis; auth 17 / catalog 10 passed; browser 11 dev / 10 built SPA-CSP passed including exact large financial values, ledger/grant tabs and responsive credit page. Screenshot inspected. Two new transactional migrations applied to development and repeated with no pending (6 total); Prisma migrate diff reports no difference. Latest Docker source build healthy all6, init jobs exit0, test:stack ready/live/web200 and actual dev DTO400. Running API explicitly reports AI disabled/zero models. Cold Docker npm ci reported 0 vulnerabilities. Hosted CI and live paid provider calls were not executed.

Failures corrected: advisory-lock SELECT void was switched to executeRaw; test-only SQL dollar-quoting syntax was corrected before applying development migration. Finance migration is atomic and failed test schemas were isolated/removed. A concurrent verify/db:generate hit the Windows loaded-engine DLL rename EPERM; rerunning after finance clients closed passed. Existing applied migrations/history were never rewritten/deleted. Out-of-bound admin reconciliation now returns409 without releasing held funds. Audit metadata distinguishes replay. Internal gateway also rejects disabled/unverified identities.

Known operational boundaries: operator-reviewed live routes/prices/keys/policies/funding are required for paid execution; token-priced OpenAI images are unsupported until an enforceable bound is verified. UNKNOWN holds stay reserved until evidence-based admin reconciliation. Provider charges use configured gross rates; invoice/tax/discount reconciliation and production load/alerts remain release work. BILLED evidence can settle usage with lost/null output, which must not be presented as recovered content. Subscription/payment activation, content/editor/generator and durable queue are future authorized work only. All checkpoint files updated; stop pending the next prompt.

## 2026-11-04 — Phase 06 AI Content Generator complete

Implemented twelve-tool registry/form metadata, strict common/task input and version1 structured output contracts, factuality/reference prompts, Catalog public source snapshot, immutable five-minute quote/pricing match, idempotent runs/deterministic gateway keys, persisted history/results, minimal Content draft/revision interface and unique saved variation links. /app/create supports workspace/brand/product, audience/platform/tone/language/objective/variation/source facts, actual preview/progress/credits/results, clipboard, draft save/view, explicit new-preview regeneration and same-key lost-response recovery. No advanced editor or social publishing. See PHASE_06.md and FILES_CHANGED.md.

Actual final checks: verify exit0 (Prisma, lint zero warnings, app/test/tool typecheck, 42 unit/component passed+3 opt-in skipped, all five builds); generator11 scenarios with all12 tools real PostgreSQL/Redis+HTTP protocol fixture; finance23 regression; integration45/45; auth17; catalog10. Browser13 development/12 built SPA-CSP scenarios passed, including clipboard, save/restore, new charged generation, invalid-output refund, responsive layout and a forwarded-but-dropped POST response recovered without second provider call. Nest application lifecycle restart restored results/drafts without provider calls. Desktop screenshot visually inspected.

Migration 20261104000600_content_generator applied to development;7 total, repeated deploy no pending, Prisma diff no differences. Latest Docker source build six services healthy, init jobs exit0, test:stack ready/live/web200 and DTO400. Actual API gate remains false/zero models; no live paid AI or hosted CI run claimed. CI generator gate added.

Corrections during QA: required composite one-to-one unique keys; numeric UiInput runtime number coercion; stale unstarted projections after expired quote; nonterminal projection regressions; fresh quote balance takes precedence over older result balance. Tests fixed ambiguous hidden dialog text, gallery readiness timing, route fault-injection removal ordering and shared refresh-throttle exhaustion across full-reload scenarios. Each browser scenario now has a distinct isolated test prefix; production rate limits unchanged. Early lint formatting warnings fixed; final verify passed. No existing applied migration/history was rewritten or deleted.

Known operational limits: operator real provider/key/price/model limits, policies and funding are still required. Live model prompt/content quality and factual accuracy, invoice/discount/tax reconciliation, production retention/load/alerts/deployment and hosted CI are not tested. Prompts prohibit invented claims; structural validators do not semantically certify facts. Invalid structured output with known usage refunds original credit grants/expiry but retains incurred provider spend; UNKNOWN keeps holds. Source snapshots persist privately. Durable generation queue, advanced editor and social publishing are not implemented. Checkpoints updated; wait for explicit Phase07 prompt.
## 2026-11-05 — Phase 07–10 authorized; Phase 07 foundation in progress

User requested editor, campaigns/calendar, media/image studio and billing together. Began dependent Phase 07 content persistence slice: new additive revision title/actor migration, attributed initial generated revision and tenant/RBAC scoped content list/read/revision/save/restore API. Expected version is required; each edit/restore creates a new revision and audit event transactionally. Prisma generation, API typecheck and targeted ESLint passed. Docker Desktop Linux daemon was unavailable; migration deployment, DB tests and full acceptance are pending. Phase 08–10 unstarted. Changed paths listed in PROJECT_STATE. This is a progress checkpoint, not a completed Phase.

## 2026-11-05 — Phase 07 revision API integration

Docker Desktop restarted; Compose rebuilt full source, all six long-running services healthy, migration 8 applied and repeat deploy had no pending. Live stack check passed. Added a real PostgreSQL/Redis scenario in scripts/test-generator.mjs for content save, stale version 409, revision restore, VIEWER 403 and cross-workspace 404; generator suite 12/12 passed. API build/typecheck and targeted ESLint passed. Host full verify failed from global npm CLI 6.14.18 recursive workspace script behavior; supported npm inside Docker built successfully. No Phase 07 browser/editor AI acceptance or Phase 08–10 implementation yet.


## 2026-11-05 — Phase 07 editor and selected-text AI subphase

Installed TipTap and wired responsive library/editor with revision autosave/conflict/history/restore, copy and text/Markdown export. Added bounded server editor JSON validation and mismatch rejection. Selected-text rewrite/shorten/expand/change tone uses the Phase 06 quote/run gateway and Phase 05 credit engine with explicit estimate confirmation; replacement is guarded against changed document/version. Full npm10 verify passed: zero-warning lint, typechecks, 42 unit/component passed +3 skipped, five builds. Real PostgreSQL/Redis generator suite 12/12 passed. No editor browser test or live paid provider call. Phase 07 is not signed off; PHASE_07.md lists missing acceptance. Phase 08–10 remain unstarted.


## 2026-11-05 — Phase 08 campaign/calendar subphase

Implemented two additive enum/table migrations, Campaign CRUD/version/search/filter/content attach API, explicit content workflow/schedule/manual publish, workspace timezone and calendar range API, real campaign list/detail and calendar range UI. First migration failed due PostgreSQL enum commit rule; marked rolled back via Prisma, split and applied both; ten migrations total, schema diff empty. Final verify passed lint/typecheck/42 unit+3 skipped/five builds; generator/campaign integration 13/13 on real PostgreSQL/Redis. No browser QA. Missing assignees/reminder/idempotent delivery/full grids/drag-drop and other PHASE_08.md acceptance; Phase 08 not signed off.


## 2026-11-05 — Local FE login connection fix

Corrected stale VITE_API_BASE_URL localhost:3000 to relative /api/v1 in ignored local .env and tracked .env.example; web container recreated only. Vite transformed config shows /api/v1. FE proxy readiness 200 and dummy invalid login through FE proxy returned expected 401, confirming API reachability. No real credentials used.


## 2026-11-05 — Campaign UI correction after user screenshot

Removed nested AppShell page padding/max-width that centered Campaign content inside a second page. Added responsive list/create and detail/overview grids, localized campaign status and true empty metadata, real create-content link, compact hierarchy. Verified full build/lint/typecheck/42 unit+3 skipped, 14 development and 13 built SPA/CSP browser scenarios; Campaign persisted and had no horizontal overflow at 1440/390. Screenshots inspected. Web rebuilt/recreated; web and API healthy, FE proxy 200. Phase 08 functional gaps remain.

## 2026-11-05 — Brand/Product layout correction after user screenshot

Restored one AppShell content frame for fragment-based legacy pages without adding nested padding to Campaign/Editor pages. Compacted catalog filters, role/entitlement-aware empty action, aligned workspace pagination, and refined topbar/sidebar and usage badge. No migration or application data mutation. Full verify before final copy change passed zero-warning lint, typechecks, 42 tests +3 skipped and five builds; browser 14 dev /13 built passed with Brand gutter/compact field/mobile checks. Final copy-only locale change passed lint/web build, then web container was rebuilt/recreated and healthy alongside API. Phase 07/08 acceptance remains incomplete.

## 2026-11-05 — Phase 09 Media Library subphase and Brand color validation

Implemented one additive MediaFolder/MediaAsset/MediaQuota migration, private S3 original/Sharp thumbnail lifecycle, quota under workspace lock, authorized folder/tag/search/file/download/delete API, audit and vi/en Vue Media page. Fixed wizard's missing max12 color check; backend already rejected 13. Migration applied, schema diff empty; full verify exit0 (42 passed+3 skipped, five builds), real PostgreSQL/MinIO media integration 6/6, browser dev 15/15 including Brand color rejection and Media upload/download/delete/no-overflow. Later media card layout passed targeted lint/web build. No image generation or design studio. Phase 10 requested afterward; PHASE_09.md lists remaining work.

