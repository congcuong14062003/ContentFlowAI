# Project state

Updated: 2026-11-05 (Asia/Saigon).

## 2026-11-05 Phase 11 admin/AI-operations subphase

Phase 11 was requested. Dedicated `/admin` layout and routes, live cross-domain overview/ECharts, filtered user/AI logs, user detail/suspension/restoration and global AI policy/provider health UI/API are implemented. Backend authorization is SUPER_ADMIN; mutations require audit and user suspension revokes sessions. `PHASE_11.md` records contracts and remaining work. Phase 11 is **incomplete**: provider/model/pricing configuration workflow, all business queues and durable notifications, richer filters, admin billing UI, mutation browser QA and built SPA acceptance remain. Prior Phase 07–10 gaps remain unchanged.

Actual evidence: final full `verify` passed after all source changes (42 unit/component passed +3 skipped, five builds, zero-warning lint and all typechecks). Real PostgreSQL/Redis/API admin integration 5/5; development Chromium 16/16 including actual `/admin` desktop/mobile screenshots and no stable-layout overflow. Dev Docker API/web rebuilt and healthy with no volume deletion; live/ready/web-admin returned 200 and unauthenticated admin overview returned 401. No new migration, paid vendor call or hosted CI claim.

## 2026-11-05 Phase 10 billing-core subphase

Phase 10 was requested and the safe billing-core slice is implemented: additive migration 12, plan versions/limits, idempotent free and pending-paid subscription requests, invoices/payments, admin evidence-based manual confirmation with one transactional subscription credit grant and audit, pending cancellation and scheduled active cancellation, member invitation limit, tenant-scoped APIs and vi/en billing page. Starter/Pro/Team have no invented seed prices. `PHASE_10.md` has exact contracts and remaining work. Phase 10 remains **incomplete**: provider/webhook/checkout, renewal/expiry/grace, upgrades/downgrades, top-ups/refunds, unified storage quota, admin UI and browser acceptance are pending. Phase 07–09 remain incomplete as previously recorded.

Actual evidence: migration deployed locally and in isolated test schema; schema diff showed no difference. Seed ran twice. Full `verify` exit0 (zero-warning lint, all typechecks, 42 unit/component passed +3 skipped, five builds). Billing integration 6/6 against real PostgreSQL/HTTP API after final changes. No payment vendor credentials, external money transfer, live webhook, billing browser run, Docker rebuild or hosted CI test claimed. No new known failing gate; the missing acceptance above is unresolved.

## 2026-11-05 Phase 09 Media Library subphase

Phase 09 requested; only its Media Library slice is implemented. Added a private workspace-scoped S3 media API and Vue page with folders, tags, search/filter/pagination, real Sharp thumbnails, metadata, authorized upload/download/delete, quota/usage and audit. Migration 11 applied; Prisma live schema diff empty. Full verify passed 42 tests +3 skipped/five builds; real PostgreSQL/MinIO media integration 6/6 and development browser 15/15 including new Media flow. A final card-layout-only change passed lint/web build after browser QA. Sharp 0.35.5 install reported zero vulnerabilities. Phase 09 Image Generator and Design Studio remain unimplemented; `PHASE_09.md` records the boundary. The user has since authorized Phase 10; no Phase 10 completion is claimed here.

The preceding Brand Kit 13-color validation defect is fixed in the wizard: backend max12 was already enforced, frontend now gives a localized error before advancing. The 15-scenario browser QA exercised invalid 13 colors then a valid save.

## 2026-11-05 Brand/Product UI correction after user screenshot

The Campaign AppShell fix exposed a legacy layout dependency: catalog pages render fragments and no longer received the shared content gutter. AppShell now owns one bounded content frame; pages with their own `.page` root have nested padding removed. Brand/Product search and filters are compact and responsive, empty states offer real creation links only when permitted by role/entitlement, workspace pagination stays aligned with its selector, and the topbar/sidebar spacing was refined. No catalog API or data was changed. Full verify passed after the structural changes (42 tests passed, 3 skipped, five builds); targeted lint/web build also passed after the final copy change. Browser QA passed 14/14 development and 13/13 built SPA/CSP scenarios with new Brand list gutter/field-width and 390px no-overflow assertions. Final dev screenshot was inspected. The final copy-only empty-state localization change was not rerun through the full suite. Web container was rebuilt/recreated and healthy; API healthy. Phase 07/08 functional gaps remain open.

## 2026-11-05 Campaign UI correction after user review

User identified excessive whitespace and weak hierarchy in the live Campaign screenshot. Removed duplicate AppShell/page width and padding, rebuilt Campaign list/detail as responsive paired panels, localized real status labels, added an actual generator link from empty campaign content, and improved unset metadata. QA screenshots for desktop/mobile were inspected under ignored .local/qa. Final verify passed: Prisma generation, zero-warning lint, all typechecks, 42 unit/component passed +3 opt-in skipped, five builds. Browser suite passed 14/14 development and 13/13 built SPA/CSP, including new Campaign persistence and 1440/390 no-overflow checks. First browser run reached the new Campaign case but failed the following legacy scenario because the new case left the route on Campaign; it now returns to workspace settings and both final suites pass. Stack was temporarily stopped externally during QA; rebuilt safely without volume deletion. Latest web container and API are healthy; web and FE proxy return 200. Phase 08 functional gaps in PHASE_08.md remain open.

## 2026-11-05 local login connectivity fix

The development .env still pointed VITE_API_BASE_URL to localhost:3000 after API_HOST_PORT moved to 53000. Changed .env and .env.example to relative /api/v1, recreated only the web container, and verified Vite serves that base. FE proxy readiness returned 200; a dummy invalid login sent through the FE proxy reached the API and returned an expected HTTP 401 rather than a network error. Six long-running services remain healthy; migrate/storage-init exited 0. No real user credentials were used in testing.

## Phase 08 campaign/calendar subphase (2026-11-05)

Campaign CRUD/search/filter/version, same-workspace brand and content binding, workflow transition/scheduling/manual publish policies, workspace IANA timezone and calendar range API were implemented with tenant RBAC/audit. FE campaign list/detail and calendar range views call real APIs. PHASE_08.md has contracts and missing acceptance. Phase 08 is incomplete: assignees, reminder idempotency, full grids/drag-drop, calendar content creation, publishing copy/download and browser QA are pending. The campaign service currently crosses the Content persistence boundary and needs refactor before signoff. Phase 09–10 unstarted.

Migration attempt hit PostgreSQL enum commit rule; Prisma marked the failed attempt rolled back. Split enum/table migrations then applied successfully; ten migrations total and schema diff no difference. Final verify exit0: Prisma generation, zero-warning lint, all typechecks, 42 passed +3 skipped unit/component, five builds. test-generator 13/13 on real PostgreSQL/Redis/local HTTP fixture, including campaign workflow/authorization/tenant/version. No Phase 08 browser acceptance or latest Docker image rebuild claimed.

## Phase 07 editor subphase (2026-11-05)

TipTap StarterKit, responsive outline/editor/assistant page and content library are connected to the Content API. Autosave 900 ms, optimistic version conflict protection, history/restore, undo/redo, preview, copy/text/Markdown export and vi/en are implemented. Validated bounded editor JSON is persisted with each revision; mismatched text/document is rejected. Selected-text AI rewrite/shorten/expand/change tone uses server quote and Generator run through the existing Credit Engine, explicit max-hold confirmation and unchanged-document check before replacing only the selection. Saved generator drafts open in the editor. See PHASE_07.md. Phase 07 remains incomplete: duplicate, tags, template, library filters, status controls, platform-specific preview, CTA/hashtag suggestions and browser acceptance are pending. No Phase 08–10 work started.

Actual checks: npm 10.9.7 copied from the pinned Node 22 Docker image was used locally (ignored .local/npm); full verify exit 0, zero-warning lint, all typechecks, 42 passed + 3 skipped unit/component tests and five builds. Generator integration 12/12 passed against real PostgreSQL/Redis/local HTTP fixture, covering revision conflict/restore/tenant/RBAC and valid/invalid/mismatched editor JSON. Migration 8 applied/repeated earlier. No browser autosave/AI-edit test and no live paid provider call.

## Phase 07–10 authorized; Phase 07 revision foundation in progress

The user authorized all four phases in one request. The first safe slice adds an additive ContentRevision migration with title/actor attribution and a tenant-scoped content list/read/revisions/save/restore API. Save and restore require an expected version and create a new immutable revision/audit entry in the same database transaction. Generated draft version 1 now records title/actor. This is backend foundation only, not Phase 07 acceptance. No Phase 08–10 business code has been started.

Actual checks on 2026-11-05: Prisma client generation, API TypeScript typecheck, API build and targeted ESLint for content/app.module passed. Docker Desktop was restarted; Compose rebuilt the full source stack and applied migration 8. Repeat migrate deploy reported no pending migrations. Live stack liveness/readiness/web=200 and DTO rejection=400 passed. Generator regression passed 12/12 scenarios against isolated real PostgreSQL/Redis, including new content save, stale-version rejection, immutable restore, role denial and cross-tenant denial. Full host verify failed because the available global npm CLI is 6.14.18 and recursively mishandles workspace script flags; Docker image build used its supported npm and succeeded. Full host lint/typecheck, browser UI and schema diff remain pending. Prior Phase 06 signoff below remains historical evidence, not validation for new code. Do not claim Phase 07 completion or proceed to Phase 08 before closing these gates.

Changed files in this slice: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20261105000700_content_revisions/migration.sql, apps/api/src/content/content-draft.service.ts, content.module.ts, content-editor.dto.ts, content-editor.service.ts, content-editor.controller.ts, apps/api/src/app.module.ts and checkpoint docs. Existing seven migrations/data remain untouched.

## Phase signoff

Phase 00–06 approved implementation and local acceptance are complete. The revised 05 gateway/credits and explicit 06 twelve-tool Content Generator are implemented. Drafts/revision1 are persisted for the future editor; advanced editing and social publishing remain unimplemented. Wait for the next explicit prompt. Local acceptance is not paid-provider quality or production-deployment acceptance.

## Phase 06 current delivery and evidence

Twelve-tool server registry, task-specific input/output schemas/prompts, scoped Brand/Product source snapshots, immutable five-minute credit/pricing quotes, single-use run keys and deterministic gateway execution are implemented. Validated results/history survive Nest application restart. Structured-output errors with known usage settle provider cost and compensate user credit atomically; unknown outcomes retain holds. Per-variation save creates Content DRAFT/revision1 once. /app/create provides dynamic forms/gallery, selectors, real preview/progress/results/credit state, clipboard, draft view, new-charge regeneration confirmation and lost-response recovery. vi/en, responsive UI and role/tenant boundaries are connected to APIs. Contracts/handoff: [PHASE_06.md](PHASE_06.md); explicit changed paths in FILES_CHANGED.md.

| Check executed for Phase 06 | Actual result |
| --- | --- |
| Final verify | Exit 0: Prisma generate, zero-warning lint, app/test/tool typecheck, 42 unit/component passed + 3 opt-in skipped, all 5 workspace production builds |
| test:generator | 11 scenarios passed; all 12 tools exercised through real PostgreSQL/Redis and test-only HTTP provider; includes source context, measured charging/refund, 29-day leap-month plan, duplicate requests, draft/revision idempotency, expiry/stale price, timeout, tenant/RBAC and application restart restore |
| test:finance | 23 scenarios passed after gateway output-contract integration; no live paid-provider calls |
| test:integration | 45/45 PostgreSQL/Redis tests passed |
| Auth / catalog regression | 17 security / 10 catalog-S3 scenarios passed |
| Development browser | 13 scenarios passed; includes dynamic tool forms, preview/generation, actual clipboard, save/restore/draft, explicit new generation, invalid-output refund, responsive layout and lost-response recovery without a second provider call |
| Built SPA/CSP browser | 12 scenarios passed with the same generator/recovery flow |
| Migration/schema | 7 migrations applied; repeated deploy has no pending; Prisma migrate diff reports no differences |
| Full Docker/live stack | Latest application source built; all 6 long-running services healthy, migration/storage-init exit0; test:stack live/ready/web200 and dev DTO400 |
| Actual runtime AI gate | Checked in running API: aiEnabled=false, configuredModels=0. No live paid provider calls were made |
| CI | Generator QA and extended dev/production browser gates configured; hosted CI not executed |

Desktop generator screenshot visually inspected; desktop/mobile artifacts under ignored .local/qa and .local/qa/production. Component QA found/fixed Vue numeric input coercion; browser harness now waits for the real gallery, scopes duplicate quote text, waits for fault-injection route handlers and isolates auth-throttle namespaces between test scenarios. Production throttle limits were not changed. An early lint gate stopped on formatting warnings; final verify passed after correction. Existing applied migrations/data were preserved.

No known failing local Phase 06 acceptance gate remains. Paid model behavior, prompt/content factual quality and hosted/production release were not tested. Prompts prohibit unsupported numbers/testimonials/claims, but structural validation is not an independent fact checker. Operator still supplies reviewed model/key/pricing/caps/funding before live execution. Serialized context and per-tool output budgets must fit that model; previews fail before spending when they do not. Quotes retain private source/prompt snapshots and need the deployment retention policy. Generation dispatch is an application invocation with durable intent/projection recovery, not a BullMQ generation queue. No advanced editor or social auto-publisher was implemented. Stop pending the next prompt.

## Phase 05 baseline evidence

Credits module: exact bigint wallet/journal, expiring sourced grants, FEFO allocations, concurrent reservations, idempotent settlement/release/refund, expiry-preserving refunds, admin adjustments/audit, funding-event deduplication and deferred SQL accounting checks. AI module: internal single-dispatch gateway, task routing, frozen server pricing, bounded text/fixed-price image adapter, provider health, caps/kill switches, workspace rate/concurrency limits, usage history and uncertain-outcome/crash reconciliation. Minimal vi/en credit balance/ledger/grants/usage UI; no Content Generator. Contracts/activation/runbook: [PHASE_05.md](PHASE_05.md). Changed paths: FILES_CHANGED.md Phase 05 section.

| Check executed | Actual result |
| --- | --- |
| Final verify | Exit 0: Prisma generation, zero-warning lint, all app/test/tool typechecks, 36 unit/component tests passed + 3 opt-in skipped, all 5 workspace builds |
| test:finance | 23 scenarios passed with real PostgreSQL and real local HTTP protocol fixtures; 20 concurrent reservations, duplicate generation/settlement/refund, funding-event dedupe, expiry, cap/rate/kill, tenant/role/disabled-user denial, crash recovery, original-day reconciliation and immutable origins/journal |
| test:integration | 39/39 passed with real PostgreSQL/Redis, including opt-in foundation checks |
| test:auth / test:catalog | 17 security scenarios / 10 real catalog/S3 scenarios passed |
| Browser dev / built SPA-CSP | 11 / 10 scenarios passed, including exact >MAX_SAFE_INTEGER balance, real ledger/grants/usage tabs, responsive display and existing auth/catalog regression |
| Migration | 6 applied; deploy repeated with no pending; fresh isolated finance schemas migrate twice |
| Schema diff | No differences between migrated development database and Prisma schema; exit 0 |
| Full Docker | Latest source built; all 6 long-running services healthy, migration/storage-init exit 0; test:stack live/ready/web=200, actual DTO rejection=400 |
| Runtime AI gate | Checked in running API: aiEnabled=false, configuredModels=0; no live generating vendor requests made |
| CI | Finance QA added; hosted CI not executed |

Latest source finance/verify checks passed after audit replay, active/verified internal-user authorization and out-of-bound reconciliation 409 handling. Desktop/mobile credit screenshots saved under .local/qa; mobile screenshot visually inspected. Temporary test migration dollar-quoting and Windows Prisma DLL rename failures were corrected before final signoff; applied migrations were not rewritten.

No known failing local Phase 05 acceptance gate remains. Paid-provider behavior, invoice-level pricing/account activation and production load/release/alerts were not tested. Operator must inject reviewed endpoints/models/prices/secrets, configure global/workspace caps and grant verified funding before paid execution. Fixed-price image contracts only; token-priced OpenAI image execution is intentionally unsupported until a verified bound exists. UNKNOWN holds require audited provider evidence, not automatic TTL refunds. BILLED reconciliation records incurred usage even if output was lost; callers must not treat a null output as recovered content. Payments/subscription activation and durable generation queues remain future work.

## Phase 04 baseline evidence

Catalog module, workspace authorization interface, Brand Kit schema v1/context API, brand wizard/CRUD/default/logo/assets, product/service CRUD/archive/multiple brands/images, search/filter/keyset pagination, RBAC/audit, private S3 and atomic brand allowances are complete. Contracts and ownership: [PHASE_04.md](PHASE_04.md). The additive migration preserves existing data and prior migrations; no production business mock data was seeded. Changed paths: FILES_CHANGED.md (Phase 04 section).

| Check executed for Phase 04 | Actual result |
| --- | --- |
| verify | Passed Prisma generation, zero-warning lint, all app/test/tool typechecks, all 5 workspace builds |
| Unit/component | 33 passed, 3 opt-in dependency tests explicitly skipped; final lint/typecheck/test also rerun after test/host-port changes |
| test:catalog | 10 scenarios passed against real Nest/PostgreSQL/Redis/S3, including concurrent quota, IDOR/RBAC, composite FKs, upload validation/private access, operator role and downgrade |
| test:auth | 17 security scenarios passed with new schema |
| Development browser | 10 scenarios passed, including brand wizard/edit, multiline fields, private upload/logo, product association/archive/search, mobile width and existing auth/UI regression |
| Built SPA/CSP browser | 9 scenarios passed, private blob images rendered successfully |
| Migration | Applied on development; repeated deploy reports 4 migrations/no pending; fresh isolated schemas migrate twice in catalog QA |
| Schema comparison | Prisma migrate diff: no differences, exit 0 |
| Docker startup | All 6 long-running services healthy; migrate/storage-init exit 0; cold npm ci in build reported 0 vulnerabilities |
| Live stack | API liveness/readiness and web 200; database/Redis/S3 up; real dev validation 400 |
| CI | Catalog + dev/production browser gates and disposable private S3 configured; compose config valid; hosted CI not executed |

Current web: http://localhost:5173. API: http://localhost:53000/api/v1. API_HOST_PORT=53000 in ignored local env avoids another project's port 3000. Internal container API stays on 3000; volumes and the other project's services remain intact.

Known operational limits: allowance uses explicit workspace provisioning/technical fallback until billing Phase 11; retained private assets and crash-time PENDING/orphans require operator lifecycle policy/future Phase 10 reconciliation; file validation does not claim malware scanning/re-encoding. No real AI calls. No known failing Phase 04 acceptance gate. Screenshots under ignored .local/qa include brand detail/mobile; desktop image visually inspected. Production deployment and real third-party activation remain outside local signoff.

## Delivered foundation

- Monorepo: API, web, worker, shared contracts and shared encrypted-mail adapter; modular monolith boundaries, ERD, API conventions and roadmap 01–15.
- Docker development stack: PostgreSQL, Redis, real MinIO built from official pinned source, idempotent bucket initialization, migration, Nest API, BullMQ worker and Vue web. All six long-running services healthy; initialization/migration jobs exit 0. Normal dependency gates are used.
- Node 22.22.2 aligned across project runtime, Docker and CI. Optional Windows scripts/npm.ps1 uses the checksum-verified ignored portable runtime present in this workspace; global Node installation was not changed.
- Nest configuration/health/logging/request IDs/errors/validation/Swagger/graceful shutdown. Development uses TypeScript compilation plus Node watch so DTO decorator metadata and validation work in development as well as production.
- Seven additive migrations; original applied migrations preserved. New indexes support keyset pagination and email outbox dispatch. Configuration-only seed remains idempotent.

## Delivered UI and identity/workspaces

- Vue Router/Pinia/TanStack Query/Tailwind/i18n, semantic Liquid Glass dark/light themes, persisted preferences, Vietnamese/English, responsive user/admin navigation and development-only showcase.
- Accessible Button/Input/CustomSelect/MultiSelect/DatePicker/Dialog/Drawer/Tabs/Card/DataTable/Pagination/Toast/Skeleton/ConfirmDialog; UiState supplies loading/empty/error states. Dialog Tab/Escape/focus restoration and reduced motion are supported.
- API-connected register/login/logout, email verification/resend, forgot/reset password, onboarding, workspace creation/switching/settings, profile/language/password and active sessions.
- Salted scrypt, digested 256-bit opaque credentials, 15-minute access/fixed 30-day refresh families, atomic rotation, replay/family revocation, Origin checks, Redis throttling, live authorization and tenant isolation. One-time verified-user system-admin bootstrap is independently guarded/audited.
- Workspace role hierarchy and ownership protection, email-bound expiring single-use invitations, accept/revoke, live inviter-authority revalidation, atomic sensitive-action audit. Workspace member profiles are obtained through the identity module public interface.
- Scoped keyset pagination (default 20, maximum 100 per page) for workspaces, members, invitations and sessions. UI can load every page; workspace switcher shares paginated data. Tested traversal of 105 workspaces without omissions/duplicates.
- Cross-tab cookie operations use Web Locks; BroadcastChannel shares access credentials only in same-origin memory and propagates sign-out. No auth credential goes to localStorage/sessionStorage.
- Verification/reset tokens and invitations commit with encrypted email outbox events in the same PostgreSQL transaction. Worker dispatches to BullMQ with stable event job IDs, retries queue outages, and consumes TLS SMTP/private development-mail jobs. Rollback/recovery behavior is tested. Delivery is at least once; SMTP cannot promise exactly-once delivery.
- Google OAuth adapter: PKCE, expiring single-use state, cookie binding, nonce, verified email, trusted issuer/audience/signature/expiry, and no implicit account linking.

## Previous Phase 00–03 acceptance evidence

| Check | Result |
| --- | --- |
| npm run verify | Passed generation, zero-warning lint, app/test/tool typecheck, unit/component tests and all five workspace production builds |
| Default tests | 28 passed, 3 dependency integration tests explicitly skipped |
| npm run test:integration | 31/31 passed with real PostgreSQL/Redis |
| npm run test:auth | 17 HTTP security scenarios passed, including >100-row pagination and outbox rollback/recovery |
| Development Chromium | 9 scenarios passed, including real registration/verification/profile/workspace flows, pagination, two-tab refresh, focus, locale/theme persistence and mobile navigation |
| Built SPA/CSP Chromium | 8 scenarios passed using built assets and same-origin API proxy |
| npm run test:providers | Authenticated SMTP over verified TLS passed; untrusted certificate was rejected before authentication/delivery |
| Google adapter contracts | Signed identity positive/negative cases plus PKCE/state/nonce/token-exchange contract tests passed; fixture network responses exist only in tests |
| npm run infra:up | Normal full-stack build/start passed, all long-running services healthy, migrate/storage-init completed successfully |
| npm run test:storage | Real S3 bucket + PUT/GET + anonymous denial + readiness=200 passed; only the generated QA object was removed |
| npm run test:stack | Actual Docker-served live/ready/web=200, request ID, and development DTO rejection=400 passed |
| Migration/seed | Additive migration applied; repeated migrate deploy reports no pending migration; seed is non-destructive |
| Shutdown/recovery | API/web/worker stopped, worker logged clean shutdown, volumes retained; normal dependency-gated restart passed |
| Images | Node 22.22.2 production runtime and Nginx images built locally, no push or external deployment |
| npm audit | Full and production dependency audits returned zero findings at verification time; cold Docker npm ci also reported zero |

Visual QA/screenshots live under .local/qa (1440/768/390px, no horizontal overflow). Tests use unique cf_test_/cf_browser_ schemas, private mailboxes and ephemeral web ports. Test schemas/mailboxes are removed after each run. Existing application data/migrations were not deleted. A browser port-collision exposed one new unverified local QA account; it was precisely identified, disabled after confirming no memberships/sessions, and audited without deleting history. The harness now uses isolated ports.

## Activation and release checks outside this local signoff

- No external SMTP or Google account credentials are configured in .env. Production adapter behavior is verified by TLS/protocol/cryptographic contracts; actual vendor-account consent and real inbox delivery remain credentialed deployment activation checks. Do not describe those external calls as tested.
- Production TLS ingress, backups/restore, load testing, provider-account configuration and public release belong to deployment acceptance (Phase 15). No hosted GitHub Actions run or public deployment is claimed.
- Keep MAIL_ENCRYPTION_KEY stable while encrypted outbox/jobs remain pending; production requires configured TLS SMTP. Never commit secrets.
- System administration business dashboard remains scheduled for Phase 13. No AI/content/billing business handlers were added.
- Repository still has no Git metadata; no commit created. File inventory is in FILES_CHANGED.md. NEXT_TASK is awaiting the user's next phase instruction.
