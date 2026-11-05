# Phase 10 — Subscriptions & Billing progress

Phase 10 was explicitly requested. This checkpoint is a safe billing-core subphase, **not Phase 10 signoff**. Phase 07–09 gaps remain separately recorded.

## Implemented

- Additive migration `20261105001000_billing_core` extends immutable plan versions with tier/cadence, member/brand/media storage limits, period credit allocation and feature keys. Invoice and SubscriptionEvent tables have tenant composite foreign keys, amount/status/period constraints and indexes. Existing payment/subscription rows and migrations are preserved.
- Seed creates only `FREE_MONTHLY_V1` with zero price/credits and one-member/one-brand/100 MiB media limit. It never overwrites an existing plan or creates an admin. Starter/Pro/Team and annual versions require an administrator to configure real prices and entitlements. Admin can create immutable plan versions and activate/deactivate them through protected API routes.
- Owner can activate a free plan immediately or request an active priced plan with a unique operation key. A paid request creates a PENDING invoice/payment and INCOMPLETE subscription; no credit or entitlement is granted. The request can be cancelled, voiding the invoice and failing the unpaid payment. Duplicate requests return the same subscription; a different open request is blocked under a workspace lock.
- Separate SUPER_ADMIN route manually confirms payment with mandatory evidence. Confirmation locks the workspace, verifies invoice/payment/plan amounts and states, and in one database transaction marks invoice/payment paid, activates subscription, applies brand/media/member limits, issues one expiring SUBSCRIPTION credit grant through the Phase 05 wallet, writes a lifecycle event and audit record. Replays do not grant again. Cancellation of an active subscription is scheduled at period end, with audit and event. Acceptance of a new workspace invitation checks the active plan's member limit under the workspace lock.
- Workspace API reads current subscription and cursor-paged invoices after membership authorization. Vue billing page presents real active plans, exact server prices, status, owner-only request/cancellation actions and invoice history in vi/en; no payment-success control exists. Existing credit page remains the transaction ledger.

## Actual checks

- Migration deployed to local PostgreSQL before this checkpoint; Prisma live schema diff reported no difference. Isolated billing test schema also deployed successfully.
- `db:seed` ran twice successfully against local PostgreSQL.
- Full `verify` exit 0 after final source changes: Prisma generation, zero-warning ESLint, all workspace/test typechecks, 42 unit/component tests passed +3 opt-in skipped, five production builds.
- `scripts/test-billing.mjs` passed 6/6 real PostgreSQL/API scenarios after final source changes: admin-only plan config and pricing validation; free activation/owner/tenant isolation; concurrent paid request replay and no premature grant; admin-only manual confirmation with evidence, idempotent grant/audit/entitlements; scheduled cancellation; pending request cancellation/void/no grant. Tests use an isolated schema and remove it after completion.
- No live payment provider, verified webhook, actual external money transfer, billing browser test, hosted CI run or latest Docker image rebuild was performed.

## Remaining Phase 10

- Payment provider abstraction, signed webhook adapter and duplicate-event processing; payment initialization, actual checkout/redirect and settlement reconciliation. Manual confirmation requires independent human evidence; the backend cannot verify the evidence itself.
- Renewal/expiry/grace scheduler, renewal invoices/history, upgrade/downgrade rules including prorations, period-end cancellation execution and subscription reconciliation. Existing active subscriptions do not auto-renew or expire yet.
- Purchased credit packages/top-up, purchase grants and expiry policy; refunds and payment history beyond invoices.
- Unified storage entitlement for Phase 04 CatalogAsset plus Phase 09 MediaAsset; currently the plan storage limit is applied only to Media Library. Feature flags and AI usage quotas are stored but not enforced across all features. Member and brand limits are enforced at the documented points.
- Admin management UI for plan configuration, subscription lookup and audited manual payment confirmation; pricing/usage limit UX and upgrade prompts; browser acceptance, webhook/renewal/refund/top-up tests.

Do not activate paid plans without real operator-supplied prices. Do not represent manual confirmation as a verified online payment flow. Preserve migration and existing data.
