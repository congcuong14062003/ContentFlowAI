# Initial REST contracts

Base `/api/v1`; UTF-8 JSON; camelCase; UUID IDs; ISO 8601 UTC timestamps. Monetary/credit BigInt values are decimal strings. `Content-Type: application/json`; mutation DTOs whitelist fields, reject unknown fields; payload limits explicit per feature. Versioned public transport types live in packages/shared.

Successful response: `{ "data": <payload>, "requestId": "<id>" }`. Lists: data `{ "items": [], "nextCursor": null }`; default limit 20, max 100; opaque validated cursor based on `(createdAt,id)` with tenant context. Never return counts as fake metrics. Update conflicts return 409 with explicit domain error code. POST creation returns 201; mutation responses return 200 with data; deletion uses 200 with confirmation payload, avoiding bodies on 204.

Error: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] }, "requestId": "..." }`. Foundation codes: VALIDATION_ERROR (400), HTTP_401, HTTP_403, HTTP_404, HTTP_409, HTTP_429, SERVICE_UNAVAILABLE (503), INTERNAL_ERROR (500). Feature phases may add stable domain-specific codes. 404 for inaccessible tenant resources avoids existence leakage. Backend logs sanitized context; client localizes code + field errors. Do not localize machine codes.

`x-request-id` echoed only when 8–80 safe alphanumeric/underscore/hyphen characters, otherwise server generates UUID. Cookie auth planned: HttpOnly refresh cookie, Secure in production, SameSite policy, restricted auth path; short-lived access token in memory, no localStorage tokens. Cookie mutation endpoints must verify Origin/CSRF. CORS allows exactly configured frontend origin with credentials. Swagger available at `/api/docs` outside production only. Readiness contains dependency availability only, never credentials.

Implemented endpoints:

| Method | Path | Success | Failure |
| --- | --- | --- | --- |
| GET | /health/live | 200 data.status=ok | process unavailable |
| GET | /health/ready | 200 data.status=ok, checks database/redis/storage=up | 503 sanitized error |

Phase 03 implemented contracts:

Additional endpoints: `POST /auth/resend-verification`, `GET /auth/options` (configured provider capabilities), `GET /admin/access` (backend SUPER_ADMIN required). Session revocation also revokes the associated refresh family; password changes revoke all sessions and require signing in again. Workspace/member/invitation/session lists use `{ items, nextCursor }`, default limit 20, maximum 100 per page, validated scope-bound opaque cursors and stable `(createdAt,id)` keysets. Session pages additionally include currentSessionId. Tokens arrive in email URL fragments and are removed from the address bar after parsing, never echoed by public auth responses.

| Method | Path | Policy |
| --- | --- | --- |
| POST | /auth/register | rate limited; email/displayName/password; safe unverified account |
| POST | /auth/login | rate limited; generic invalid credentials; access + refresh cookie |
| POST | /auth/refresh | rotate atomically; reuse revokes family; Origin check |
| POST | /auth/logout | revoke session; expire cookie; Origin check |
| POST | /auth/verify-email | single-use expiring token |
| POST | /auth/forgot-password | generic response; no account enumeration |
| POST | /auth/reset-password | single-use expiring token; revoke sessions |
| GET | /auth/google; /auth/google/callback | configured adapter only; state/PKCE, verified email, no implicit linking |
| GET/PATCH | /users/me | authenticated; displayName/language allowlist |
| POST | /users/me/password | current password; revoke other sessions |
| GET/DELETE | /users/me/sessions[/:sessionId] | own sessions only |
| POST/GET | /workspaces | authenticated creation/list own memberships |
| GET/PATCH | /workspaces/:workspaceId | member / owner or admin |
| GET | /workspaces/:workspaceId/members | member |
| PATCH/DELETE | /workspaces/:workspaceId/members/:userId | role hierarchy; last owner protected |
| POST/GET | /workspaces/:workspaceId/invitations | admin/owner; allowlisted grantable role |
| DELETE | /workspaces/:workspaceId/invitations/:id | owner/admin; tenant scoped |
| POST | /invitations/accept | authenticated verified matching email + single-use token |

Browser workspace selection selects route/query scope only; it never grants permissions. Phase 03 email delivery must use a configured adapter and durable queue/outbox; development delivery may write a local mailbox that is not publicly served. No production token returned in registration/forgot-password responses.

## Phase 04 catalog

Implemented endpoints, full replacement DTOs, pagination/filter semantics, versioned BrandKit context, role matrix, binary private image exception, upload limits and entitlement errors are specified in [PHASE_04.md](PHASE_04.md). All endpoints are workspace-scoped and authenticated; no AI provider is called. Brand allowance conflicts use 409/BRAND_LIMIT; image size rejection uses 413.

## Phase 05 AI and credits

See [PHASE_05.md](PHASE_05.md) for implemented credit balance/ledger/grants, cost estimate, usage history and audited system-admin policies/grants/adjustments/refunds/reconciliation APIs. All financial quantities serialize as decimal strings. There is deliberately no public generation endpoint. Unknown provider execution keeps its holds and requires evidence-based reconciliation; no member-supplied prices or balances are accepted.

## Phase 06 quoted Content Generator

Authenticated workspace paths /generator/tools, /quotes, /runs, /runs/:id, /runs/:id/resume, /runs/:id/drafts and /drafts/:contentId implement the twelve tools. Tool input/strict structured output, quote ownership/expiry, deterministic gateway key, role matrix, measured settlement/refund, restore semantics and draft version-1 format: [PHASE_06.md](PHASE_06.md). POST runs is 202; GET polls real state. All money remains decimal strings. No raw provider price or charge is accepted from frontend.
