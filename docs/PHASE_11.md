# Phase 11 — Admin Dashboard & AI Operations progress

Phase 11 was explicitly requested. This is an admin dashboard and operations **subphase**, not full Phase 11 signoff. Phase 07–10 gaps remain separately recorded.

## Implemented

- `/admin`, `/admin/users` and `/admin/ai` use a dedicated responsive AdminShell with sidebar, mobile drawer, topbar, user search, language/theme controls and a live AI-failure link. The ordinary AppShell no longer owns admin routes. Backend `/admin/*` endpoints require AuthGuard and independent SUPER_ADMIN guard; router guard is only a UX layer.
- Overview reads actual PostgreSQL rows: total/new users, valid recently created sessions, active paid/total subscriptions, saved AI drafts, AI generations, settled usage credits/provider cost, catalog plus media storage bytes, 30-day FAILED/UNKNOWN generation rate and platform-health BullMQ queue counts. Sparse daily/grouped series power ECharts user growth, subscription starts, AI costs/requests/credits, plan/provider distribution and generation outcomes. Empty series show an honest empty state. API includes metric definitions and 30-day window; queue scope is platform-health, not the future image-generation queue.
- User directory has search/status cursor pagination, detail with membership/subscription data, workspace-shared usage and recent audit events. Admin suspension/restoration requires a 20–500 character reason, cannot target self or another SUPER_ADMIN, locks the target user, revokes active sessions and audits the change in one transaction. No password/session token material is returned.
- AI operations shows safe provider route metadata and live health from existing ProviderRegistry, global AI policy read/update with confirmation and existing audited backend policy service, plus filtered/paged generation usage logs without prompt/input/output or provider secrets. The global policy supports enable/disable, daily cost cap, rate limit and concurrency cap. Model route, price and provider key configuration remain environment-owned and require operator deployment; no form pretends they can be hot changed.
- ECharts and BullMQ are installed in the correct web/API workspaces. ECharts is loaded only on the admin overview route with modular chart imports. No new migration or production metrics fixture was added.

## Actual checks

- Final full `verify` passed after all source changes: Prisma generation, zero-warning lint, all typechecks, 42 unit/component tests passed +3 opt-in skipped, five production builds.
- `scripts/test-admin.mjs` passed 5/5 against a real isolated PostgreSQL schema and local Redis/API: ordinary/anonymous admin denial, exact counters/trends/storage/paid subscription/queue, user and AI log filtering with private fields excluded, suspension/revocation/restoration/audit, and admin-only audited AI policy changes. Isolated schema was removed afterward.
- Development Chromium passed 16/16 scenarios including admin overview, users and AI pages; 1440/390 screenshots were visually inspected. ResizeObserver needs a frame after a desktop-to-mobile viewport change before ECharts canvas reaches the new width; the QA waits for layout settlement. Docker dev API/web were rebuilt and recreated without removing volumes; API/web/worker/PostgreSQL/Redis/storage are healthy, migrate/storage-init exited 0. Live API liveness/readiness and web /admin returned 200; unauthenticated /api/v1/admin/overview returned 401. No built SPA/CSP admin browser run or hosted CI was performed.
- No real paid provider was configured or called for Phase 11; browser AI fixture is test-only.

## Remaining Phase 11

- Actual worker/process heartbeat and all business queue health beyond the foundation platform-health queue; alert/notification inbox persistence and delivery.
- Operator-safe provider/model configuration, route/price revision workflow, per-workspace AI policy UI and failure drilldown, with secret references stored only in deployment secret management. Current routing/pricing are boot-time environment configuration, and only global/workspace spend policies can be changed through protected APIs.
- More user filters (workspace/plan/date), deeper subscription and account activity views; admin billing plan/subscription/payment management from unfinished Phase 10.
- Browser tests for admin mutation workflows, built SPA/CSP admin acceptance, load/aggregation performance tests and production queue monitoring.

Never label platform-health queue connectivity as proof that future generation or image jobs are being processed. Preserve audit events and existing migrations/data.
