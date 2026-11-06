# Phase 12 — Financial analytics and customer support checkpoint

Phase 12 is **partially implemented**. The financial report and tenant-safe support flows are usable, but refund source/reconciliation, browser acceptance and production deployment checks remain open.

## Financial contracts

- `GET /api/v1/admin/finance?from=<ISO>&to=<ISO>&currency=USD[&workspaceId&planId&provider]` is SUPER_ADMIN-only. Range is `[from,to)`, maximum two years and cannot end in the future. The UI selects inclusive calendar days and translates them to this API range. `GET /admin/finance/export.csv` exports daily rows using the same filters.
- Recognized revenue allocates **paid invoice** amounts across the invoice service period using PostgreSQL numeric time overlap. Collection uses successful payments by immutable `collectedAt`; older successful rows are backfilled from `updatedAt` and are explicitly marked approximate. MRR is the current active paying subscription snapshot, with yearly price divided by 12. Active paying customers counts distinct workspaces. Revenue is reported per selected currency in minor units; AI/provider costs and contribution are in USD micros.
- AI cost, provider distribution, credits and cost per workspace use settled `AiUsage`. AI cost has no reliable plan attribution, so contribution is unavailable under a plan filter. No unused credit balance is treated as profit.
- `POST /api/v1/admin/finance/costs` records an immutable administrator-entered STORAGE or INFRASTRUCTURE USD-micro expense with unique source key, optional workspace, incurred date and audit. `GET /admin/finance/costs` lists recent entries. An empty category is `null` / “Chưa có dữ liệu”. Partial gross contribution subtracts measured AI cost only. Full known-cost contribution is shown only when both manually entered categories have entries, for USD without plan/provider filters; operator-entered data coverage is not independently verified. Global expenses are shown in totals but are not allocated across workspaces.
- Refunds remain `null` because Phase 10 has no durable refund amount/timestamp flow. Payment status alone is insufficient for a dated refund report. The UI has seven ECharts views (line/bar/pie, no OHLC candle), metric definitions, cost entry and CSV export. “Revenue by plan” is paid invoice amount by invoice creation date, while the revenue line is service-period recognition; labels keep these meanings separate.

## Support contracts

- Workspace user: `GET/POST /workspaces/:workspaceId/support`, `GET /:id`, `POST /:id/replies`. A user sees only tickets they requested in a workspace they still belong to, and only public messages/history. Create supports SUPPORT and FEEDBACK.
- Administrator: `GET /admin/support`, `GET/PATCH /:workspaceId/:id`, `POST /:workspaceId/:id/replies`. SUPER_ADMIN can search/filter, assign an active system administrator, set status/priority, send public replies or private notes. Audit events form ticket history. Composite tenant keys enforce ticket/message/notification ownership at the database boundary.
- Public admin reply creates one in-app notification for the requester in the same transaction. `GET /support/notifications` and `PATCH /:id/read` are user-scoped; AppShell polls every 30 seconds. Internal notes do not notify or appear in user detail/history. Notifications are in-app only; email/push delivery and preferences are not present.

## Actual checks

- `npm run verify` passed in an ephemeral local Docker tooling container: Prisma generate, zero-warning lint, all typechecks, 47 passed tests plus 3 opt-in skips, all five production builds. A final finance date-selector/axis adjustment then passed targeted zero-warning lint, web typecheck and web production build. Existing image uses Node 22.22.0, two patch versions below the declared minimum 22.22.2; `npm_config_engine_strict=false` was used for these checks. No hosted CI claim.
- Migration 13 deployed on disposable PostgreSQL 17; Prisma schema diff reported no difference. A real PostgreSQL fixture passed recognized revenue, collection/MRR separation, date and workspace filtering, AI/entered-cost contribution, admin cost authorization/idempotency, ticket cross-workspace/requester denial, public replies, private notes and notifications. Disposable test database was not the development/production database.
- Browser UI and live HTTP authorization/end-to-end tests were not run. The app was not redeployed. Existing Phase 07–11 gaps remain in their own checkpoints.

## Remaining

Build a verified refund event/amount ledger and reconciliation before reporting refunds. Add cost import/reconciliation/coverage periods, FX handling for non-USD contribution, historical MRR/subscription event reconstruction, more scalable report pagination/materialization, ticket pagination and attachment/SLA controls, optional email/push notifications and preferences. Run browser and live HTTP checks, especially admin cost entry, CSV download, notification polling, responsive charts, and mutations. Preserve prior migration/data and avoid relabeling partial contribution as audited profit.
