# ContentFlow AI — Master specification

## Scope and status

Approved request: Phase 00–11. Phase 05 is AI Provider Gateway & Credit Engine; Phase 06 adds the twelve-tool AI Content Generator. The user requested Phase 07 editor, 08 campaigns/calendar, 09 media/image studio, 10 subscriptions/billing and 11 admin/AI operations. Implement in safe dependent subphases; completion status and actual evidence are in PROJECT_STATE. Phase 07 content revision and TipTap/selected-text AI foundation is in progress; remaining acceptance is tracked in PHASE_07.md. Phase 08 campaign/calendar foundation is in progress. Phase 09 Media Library is a verified subphase; Image Generator and Design Studio remain in PHASE_09.md. Phase 10 subscription/manual-billing core and Phase 11 admin/dashboard core are verified subphases; remaining scope is in PHASE_10.md and PHASE_11.md.

## Fixed stack

TypeScript npm workspaces; Vue 3/Vite/Tailwind/Pinia/TanStack Query/Vue Router, TipTap for editing, ECharts for analytics. NestJS modular monolith, Prisma/PostgreSQL, Redis/BullMQ, S3-compatible storage, Docker Compose and Nginx. REST under `/api/v1`. No microservice split. Worker is a process boundary, not a separate domain owner.

## Runtime and module boundaries

`apps/web` owns browser presentation, `apps/api` owns HTTP, domain policy and persistence, `apps/worker` owns asynchronous processing. `packages/shared` contains public transport types only. `infrastructure` contains deployment configuration. Prisma schema and migrations belong to API; worker may use extracted domain services later but must not import controllers or bypass tenancy/credit policies.

Phase 03 adds `packages/mail`, a shared infrastructure adapter for authenticated AES-256-GCM payloads and SMTP/local delivery. API commits encrypted outbox events with verification/reset/invitation records in one transaction. Worker dispatches pending events to BullMQ with stable event job IDs, marks accepted events published and owns retries/delivery. This package imports no API controllers or domain policies. SMTP uses Nodemailer with certificate verification; Google identity uses jose with PKCE/state/nonce and trusted cryptographic identity validation, without implicit account linking. Email delivery is at least once, not an exactly-once SMTP guarantee.

Authentication: 256-bit opaque access/refresh credentials, SHA-256 digests only in PostgreSQL. Access expires in 15 minutes; refresh families have a fixed 30-day absolute expiry. Rotated predecessors are retained for replay detection and family revocation. User-row locks serialize refresh, logout, session revocation and password mutations. Access tokens live only in browser memory; refresh cookie is HttpOnly, Secure in production, SameSite=Lax and restricted to `/api/v1/auth`. Login/refresh/logout enforce exact configured Origin. Frontend cookie operations serialize across tabs using Web Locks; BroadcastChannel shares access credentials only in same-origin memory and propagates sign-out. Passwords use salted scrypt N=32768/r=8/p=1, 64-byte output. Email verification precedes login. Redis rate limits auth, password and invitation endpoints.

Workspace mutations lock the workspace and recheck membership transactionally. Invitations are email-bound, expiring, single-use, cannot grant OWNER and revalidate inviter authority on acceptance. Existing memberships are never overwritten by invitation acceptance. One-time administrator bootstrap promotes an already verified account using explicit environment configuration, refuses repeated bootstrap and writes an audit event.

Dependency direction: controller -> application service -> domain policy -> repository/provider port -> infrastructure adapter. Nest feature modules export application services, never their repositories. No feature may access another feature's Prisma models directly. Platform is dependency-only and cannot import feature modules. Shared cannot import apps. Cross-domain operations use explicit services and database transactions/outbox; no circular module imports.

| Module | Owns | Allowed feature dependencies |
| --- | --- | --- |
| identity | users, password/token/session/OAuth lifecycle | none |
| workspaces | membership, invitations, role policy | identity public identity lookup |
| catalog | brands/guidelines, products/associations, owned assets, brand entitlement | workspaces public authorization |
| media | workspace media folders/assets, private storage, quota and thumbnails | workspaces public authorization, platform storage |
| content | documents/immutable revisions; generated-draft create/read and draft revision editor in progress; approval future | workspaces/identity public authorization |
| generator | tools, quoted source/pricing snapshots, generation runs, saved variation links | workspaces/identity, catalog context, AI gateway, credit reads, content drafts |
| campaigns | campaign lifecycle, content association | workspaces, content public operations |
| ai | provider adapters, routing, immutable intents/usage, policies, spend buckets, health | workspaces/identity public authorization, catalog public context, credits financial primitives |
| credits | account, expiring grants, allocations, reservation, append-only ledger | workspaces/identity public authorization |
| billing | plan versions, subscriptions, invoices/payments and lifecycle; manual audited confirmation implemented, verified webhooks pending | workspaces, identity, credits, catalog and media public entitlement services |
| administration | separate `/admin` layout, cross-domain read-only aggregate projection, user suspension/audit | identity authorization, AI/Billing public service boundaries; direct Prisma joins only for the admin read model |
| audit/outbox | durable events and delivery | no feature imports |
| platform | configuration, database, Redis, storage, logging | none |

## Tenancy and authorization

Global `SystemRole`: USER or SUPER_ADMIN. Workspace roles: OWNER, ADMIN, EDITOR, VIEWER. System role never derives from membership. `/admin` frontend convenience is not a security boundary; backend requires authenticated SUPER_ADMIN independently. System administrators do not silently bypass tenant routes; explicit administration operations must be audited.

Every tenant endpoint takes workspace ID from its route, checks live membership, and queries with BOTH resource ID and workspace ID. Jobs carry validated workspace ID; processors revalidate domain state. Composite foreign keys enforce same-workspace references. Phase 03 tenant APIs have live backend authorization and actual HTTP denial/escalation/isolation tests. Membership and invitation mutations serialize on a workspace row lock. Membership profile projections use the identity public interface.

| Action | OWNER | ADMIN | EDITOR | VIEWER |
| --- | --- | --- | --- | --- |
| Read workspace/content | yes | yes | yes | yes |
| Create/edit draft, request review | yes | yes | yes | no |
| Approve content | yes | yes | no | no |
| Manage non-owner members/invitations | yes | yes (cannot grant OWNER/ADMIN) | no | no |
| Update workspace settings | yes | yes | no | no |
| Billing, ownership transfer, archive workspace | yes | no | no | no |

Ownership transfer requires a transaction and existing verified member. One owner is initially enforced with a partial unique index; transfer must demote then promote within one transaction and lock the workspace. The last owner cannot leave or be removed. Invitation role OWNER is forbidden. DTOs never accept systemRole, userId, workspaceId overrides, balances, or arbitrary membership properties.

## Domain workflows (design only until their phase)

Phase 05 internal generation is implemented: active verified editor+ authorization → runtime validation/task routing → scoped fingerprint/idempotency check → atomic spend/rate/concurrency admission, frozen pricing intent and worst-case credit reservation → single dispatch claim → bounded provider call → atomic measured usage/credit/spend settlement. Uncertain timeout/cancellation/crash retains holds until audited reconciliation; no blind retry/fallback. Brand context uses the catalog interface. Phase 06 exposes task-specific quoted generator APIs and /app/create, validates structured output, persists results and saves DRAFT version 1 with its initial revision. Raw gateway execution remains internal. Durable generation outbox/jobs and advanced editing remain future work. Financial rules and safe provider activation: PHASE_05.md.

Approval: DRAFT -> IN_REVIEW (editor+) -> APPROVED (admin/owner). Rejection returns DRAFT with audited reason. Edits to approved content create a new draft revision using optimistic version checks, never silently mutate an approved snapshot. ARCHIVED is explicit, reversible per domain policy. Full transition audit comes in content phase.

Phase 05 credits use bigint/decimal strings, no floating point. Account balance >= reserved >= 0. Wallet/grant/held-reservation/journal totals are checked by deferred SQL triggers at commit. Immutable ledger records balance/reserved deltas. Funding-event and operation-key uniqueness prevent duplicate grants; terminal settlement/refund prevents duplicate charges. Expiring grants follow FEFO allocation; unresolved held funds stay pinned; refunds retain original expiry. Global/workspace UTC-day cost commitments remain separate from credit refunds. Payment/subscription activation remains future billing work.

Subscription: server selects active plan -> payment provider checkout -> signed webhook verifies provider event + deduplicates -> transaction updates payment/subscription + grants credits once + audit/outbox. Frontend redirect cannot activate subscription or grant credits. Use integer currency minor units, no payment card storage. Enforce event ordering/reconciliation and one active subscription per workspace.

## API, errors, validation and audit

See API_CONTRACTS.md. DTO whitelist + forbid unknown fields; explicit coercion only. UUID route validation; bounded text and payload limits. Responses carry request IDs; error messages exclude stacks, database errors and secrets. Logs redact cookies/authorization and omit query strings. No request body logging. Audit records contain actor/workspace/action/entity/requestId and allowlisted metadata, never passwords/tokens/prompts by default. Sensitive successful mutations and rejected privileged actions must be audited in their owning feature phase.

## Frontend architecture (Phase 02 specification)

`src/app` bootstraps router/query/i18n/store; `src/layouts` shells; `src/components/ui` primitives; `src/features/<domain>` pages, API functions, query keys and composables; `src/lib/api` typed fetch/error mapping; `src/locales/{vi,en}` messages; `src/styles` semantic tokens. Server data belongs to TanStack Query. Pinia holds transient session/workspace/theme preferences, never copies of server tables. Invalidate query cache on workspace switch/logout; include workspace ID in every tenant query key.

Router groups: public auth (`/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`); authenticated onboarding (`/onboarding`); workspace (`/w/:workspaceId/...`); account (`/settings/...`); separate administrator shell (`/admin/...`). Backend remains authoritative.

Premium Liquid Glass: semantic bg/surface/text/muted/border/primary/danger/success tokens; dark and light contrast >= WCAG AA; 4px spacing base; readable system typography; subtle gradients and bounded blur, glow only for interaction feedback. CSS reduced-motion support, visible focus, labels/errors bound with aria attributes. Theme uses localStorage with system fallback. Vietnamese/English i18n without hardcoded page text. No fake dashboard metrics. Design system showcase is internal development UI.

Primitives required in 02: Button, Input, CustomSelect, MultiSelect, DatePicker, Dialog, Drawer, Tabs, Card, DataTable, Pagination, Toast, Skeleton, EmptyState, ErrorState, LoadingState, ConfirmDialog. Keyboard navigation and focus restoration are acceptance criteria, not visual polish. Desktop sidebar, tablet collapse, mobile drawer, no horizontal page overflow.

## Environment, secrets and operations

Node 22.22.2+ within 22.x, npm lockfile committed. Config validates before startup. `.env.example` contains no usable secrets. `.env*` ignored except example. Local credentials generated with CSPRNG by setup script, never shipped credentials. Production injects env/secrets externally; no frontend `VITE_*` secret. Production compose uses external S3; local MinIO root access is development-only. Production storage credentials must be bucket-scoped and least privilege. HTTPS terminated at trusted ingress; loopback HTTP listener is not a public deployment.

Prisma migrations are immutable once applied. Deploy via `migrate deploy`, never `db push` in shared environments. No automatic resets or destructive down-volume commands. New breaking changes use expand/backfill/contract phases and backups. Schema uses UTC timestamptz, UUIDs, tenant-scoped indexes/uniques and explicit delete behavior. Append-only ledger/audit enforced by SQL triggers. Seed inserts safe configuration only with empty updates; no accounts, administrator, mock customers or pricing inventions. Phase 03 adds one-time admin bootstrap with externally supplied verified identity, never a default password.

## Verification gates

Each phase: lint, typecheck, suitable tests, build, then checkpoint with exact outcomes and limitations. Foundation requires real PostgreSQL migration twice + seed twice, Redis/BullMQ round trip, S3 readiness, Docker build/start/health/shutdown. CI specification is not evidence of a passing CI run. Tests using test doubles must be described separately from real dependency integration. Future roadmap: ROADMAP.md. ERD and database invariants: DATABASE.md.
