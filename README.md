# ContentFlow AI

Phase 00–06 implementation and local acceptance are complete. The app has a Premium Liquid Glass UI, Vietnamese/English, authentication, user settings, sessions, workspaces, roles, invitations, brand kits and product/service catalog connected to real APIs. AI gateway/credits and the twelve-tool Content Generator are implemented; advanced editing and payments remain future work.

See docs/PROJECT_STATE.md for evidence and docs/NEXT_TASK.md for the next-phase boundary.

## Start locally

Requires Node 22.22.2 within 22.x, npm 10+ and Docker Desktop Linux engine. .node-version/.nvmrc, Docker and CI use the same Node baseline. On this Windows workspace, ./scripts/npm.ps1 run <script> selects the checksum-verified ignored portable runtime in .local/runtime; global Node was left unchanged.

```powershell
npm ci
node scripts/setup-local.mjs
npm run infra:up
```

setup-local creates ignored random credentials and refuses to overwrite an existing .env. For a pre-Phase-03 .env, use node scripts/setup-mail.mjs to append only a missing random mail encryption key. Existing credentials are preserved.

infra:up builds/starts PostgreSQL, Redis, real MinIO, initialization/migration jobs, API, worker and web, then checks their actual health. MinIO is built from pinned official source releases in infrastructure/storage.Dockerfile, so first build downloads Go dependencies; later builds use cache. Completed initialization/migration jobs exit 0 and are not treated as failed long-running services.

- App: http://localhost:5173 (use the configured WEB_ORIGIN exactly for cookie mutation Origin checks).
- API: http://localhost:3000/api/v1 by default; current local override http://localhost:53000/api/v1
- Swagger (development): API host/port + /api/docs (currently http://localhost:53000/api/docs)
- Readiness: API host/port + /api/v1/health/ready (database/Redis/storage all up).
- MinIO console: http://localhost:59001 (local credentials in ignored .env).
- Private development mail: .local/mail (never served by web/API).

Register, open the verification link in the private mailbox, verify, sign in and create a workspace. The worker must run for mail delivery. There is no default user, administrator password or seeded business data.

For host hot reload instead of app containers:

```powershell
docker compose --env-file .env -f infrastructure/compose.dev.yml up -d postgres redis storage storage-init
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
# Separate terminals:
npm run dev:worker
npm run dev:web
```

Stop app containers before using their host ports. API dev mode uses tsc plus Node watch to preserve Nest DTO decorator metadata and validation. Only a successful TypeScript build restarts the server. Worker dev mode uses tsx. Safe stop: npm run infra:down preserves all volumes and application data.

## Verification

```powershell
npm run verify
npm run test:integration
npm run test:auth
npm run test:providers
npx playwright install chromium
npm run test:browser
npm run test:stack
npm run test:storage
npm audit
```

verify performs Prisma generation, mail-adapter build, zero-warning lint, application/test/tool typecheck, unit/component tests and all workspace builds. The default run explicitly skips three opt-in PostgreSQL/Redis tests; test:integration loads local loopback .env URLs to execute them.

Auth/browser suites create unique database schemas and private mailboxes and remove only those generated artifacts. Browser web servers use ephemeral ports and a per-run ownership marker, so tests can run while the development stack is active. Browser artifacts are under .local/qa. Do not supply production database URLs to these local scripts.

Provider tests exercise authenticated TLS SMTP and rejection of untrusted certificates, using ephemeral test certificates. OpenSSL is used when installed; otherwise the built dev image generates the test certificate. OAuth unit contracts validate PKCE/state/nonce, signed identities and invalid audience/signature/expiry/verified-email cases; fixtures exist only in tests.

Compiled SPA/CSP acceptance:

```powershell
npm run build
$env:BROWSER_MODE='production'
npm run test:browser
Remove-Item Env:BROWSER_MODE
```

Built SPA tests use production assets/CSP with same-origin proxy, not a public HTTPS deployment. Hosted GitHub Actions configuration is present; no remote CI run is claimed without a configured repository.

## Security and mail configuration

Access credentials stay in browser memory; refresh uses an HttpOnly cookie, Secure in production. Web Locks serialize cookie operations across tabs; BroadcastChannel distributes access credentials/sign-out only within the same origin. No auth token is persisted in localStorage/sessionStorage.

API and worker share MAIL_ENCRYPTION_KEY (64 random hex characters). Token/invitation changes and encrypted outbox events commit together. Worker dispatches with stable event IDs, recovers queue interruptions and retries delivery. Keep the encryption key while outbox/jobs are pending. SMTP is at least-once delivery; repeated email does not make a consumed token reusable.

MAIL_MODE=local is development-only and is rejected in production. Production requires MAIL_MODE=smtp, SMTP_HOST/PORT/USER/PASSWORD and verified MAIL_FROM. TLS certificate verification remains enabled. SMTP_SECURE=true supports implicit TLS on an explicitly configured port; SMTP_CA_FILE optionally trusts an operator-provided private CA without disabling verification.

Google sign-in appears only with GOOGLE_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI. The registered callback must end with /api/v1/auth/google/callback and use HTTPS in production. State/PKCE/nonce and Google issuer/audience/signatures are verified. Existing password accounts are not silently linked by email.

Actual Google consent and real external inbox delivery need operator-owned credentials/registered configuration. Adapter/protocol contracts are tested; those real vendor calls are not claimed as executed. This activation step is separate from completed Phase 03 application implementation.

One-time super-admin bootstrap promotes one already registered/verified account, creates no password and refuses a second bootstrap:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL='your-verified-admin-address'
$env:BOOTSTRAP_ADMIN_CONFIRM='PROMOTE_VERIFIED_USER'
npm run admin:bootstrap
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_CONFIRM
```

System role is independent of workspace Owner/Admin. Workspace mutations lock/recheck authorization and audit; invitation acceptance rechecks inviter authority and never overwrites an existing membership. All business lists use scoped keyset cursors, default 20/max 100 per request, with UI load-more; total records are not capped at 100.

## Database and deployment

Applied migrations are immutable. db:migrate uses migrate deploy and can repeat safely; the seed only inserts supported-language configuration. No reset/down-volume script is provided. No application data or existing migration was deleted during acceptance.

Production Compose is separate: infrastructure/compose.prod.yml with externally supplied ignored .env.production, HTTPS PUBLIC_WEB_ORIGIN, secure credentials, TLS SMTP and least-privilege external S3. Nginx binds loopback HTTP for a trusted TLS ingress and proxies /api; Node runtime runs as non-root with pruned dependencies. Image builds are checked locally. Public deployment, production account activation, backup/restore and load/release acceptance remain deployment work, not completed tests in this checkpoint.

Phase 04 Brand Kit & Product Catalog is documented in docs/PHASE_04.md. Workspace navigation exposes brand wizard/detail/assets and product forms/search/filters. No AI calls or billing flow are implemented. Run npm run test:catalog for real database/S3/RBAC/entitlement checks.

DEFAULT_BRAND_LIMIT is the technical fallback allowance. An operator can set a workspace override using npm run catalog:set-limit with ENTITLEMENT_WORKSPACE_ID, ENTITLEMENT_ACTOR_ID (active verified system super admin) and ENTITLEMENT_BRAND_LIMIT in the environment; remove those variables afterward. Workspace users cannot raise their own limits.

If host port 3000 is occupied, set API_HOST_PORT in ignored .env (this workspace uses 53000). Docker API remains on internal port 3000 and web proxy remains functional. test:stack reads the override. For host-only Vite/API development, set API_PORT and API_PROXY_TARGET consistently. Never stop another project's service just to free a port.

Phase 05 AI Provider Gateway & Credit Engine is implemented; see docs/PHASE_05.md for financial invariants, APIs, unknown-outcome handling and activation. The explicit Phase 05 prompt supersedes the old content-editor slot; do not start any next phase automatically.

## AI gateway and credits

Workspace navigation includes a read-only Credits & usage page backed by real wallet, ledger, grant and usage APIs. All financial amounts are decimal strings; no initial credits or fake provider data are seeded. Run npm run test:finance for real PostgreSQL concurrency/accounting tests with test-only HTTP provider fixtures. These are not live paid-provider acceptance tests.

AI_ENABLED defaults false. Configure AI_ROUTING_CONFIG with reviewed provider endpoints, pinned models, priceVersion, integer USD-micro token rates/bounds, and AI_SECRET_* environment variable names. Inject actual secrets externally. No frontend price/balance is trusted. Enable global and workspace policies with explicit daily caps, rate/concurrency limits and funded credits using authenticated system-admin APIs. Full fields and activation order: docs/PHASE_05.md. The public generator at /app/create uses server quotes and validated tool schemas; raw gateway execution remains internal.

Timeout/cancellation after dispatch retains credit and spending reservations as UNKNOWN. Repeated operation keys return the same intent without resending. An active verified system super administrator must reconcile with trusted provider evidence; never auto-release an uncertain hold because its lease expired. Credit refunds do not refund recorded provider spending.

On Windows, let running API/database tests close before npm run db:generate or verify replaces the Prisma engine DLL. A temporary EPERM engine rename indicates an in-use file, not permission to reset a database.

## Phase 06 Content Generator

Open http://localhost:5173/app/create and choose a workspace/brand. Twelve API-driven tools have dedicated inputs, source facts, audience/platform/tone/language/objective/variation controls, server credit preview, real status/results/history, clipboard, per-variation draft save and explicit new-preview regeneration. Drafts are stored as Content DRAFT version 1 plus initial ContentRevision for Phase 07; current view is read-only. No social publishing is implemented.

A preview is a five-minute immutable server quote. Starting accepts quote ID and operation key, not a frontend price. Lost-response recovery reuses the same key; UNKNOWN billing never triggers an automatic paid retry. Invalid structured output with known usage is settled and compensated atomically, preserving provider spend and original grant expiry. Full contracts/API/retention/limits: docs/PHASE_06.md. Run npm run test:generator for all twelve tools through real PostgreSQL/Redis and test-only HTTP provider fixtures. AI in the normal local stack remains disabled until operator keys/routes/prices/caps/funding are supplied; paid-model quality is not established by fixture tests.

Do not implement Phase 07 until the next explicit prompt.
