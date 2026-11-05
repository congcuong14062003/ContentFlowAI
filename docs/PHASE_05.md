# Phase 05 — AI provider gateway and credit engine

The user's explicit Phase 05 prompt replaces the originally planned content-editor phase. This phase implements backend gateway/accounting and read-only credit inspection UI. Content editor/generator, payment checkout/webhooks and durable generation queues are not implemented. Wait for the next explicit prompt; do not infer the next phase from the old numbering.

## Modules and trust boundaries

`credits` owns wallets, grants, allocations, reservations and immutable ledger. CreditWalletService exports transaction-scoped financial primitives for trusted backend callers. CreditsService handles member reads and audited administrator operations. It uses public workspace/identity authorization interfaces.

`ai` owns routing/adapters, immutable generation intents/pricing, usage, policies, rate windows, spend buckets and provider health. AiGatewayService is the internal generation entry point; there is no public generation endpoint. It imports CreditWalletService, workspace authorization, identity active-user validation and CatalogService.brandContext. No feature directly reads another feature's user/membership/brand tables. No new library or architectural topology was introduced.

Transport quantities use decimal strings. Backend arithmetic uses bigint; PostgreSQL financial columns are BIGINT, not floats. Rates/costs are USD micro-units; one USD is 1,000,000 micros. Token rates are integer micros per million tokens. Each component rounds upward to a micro-unit, then cost-to-credit conversion rounds upward using the immutable AI_CREDIT_MICROS_PER_ATOM snapshot. Costs represent measured usage at the configured contractual gross rates, not a claim that external invoices/taxes/cache discounts were fetched.

## Wallet and expiry policy

Grant sources: SUBSCRIPTION, PURCHASE, PROMOTIONAL, ADMIN, LEGACY. Grants retain original amount, source, funding reference, expiry, operation key and fingerprint. Subscription/promotional grants require a future expiry; purchased/admin grants may be non-expiring. Future subscription integration must use period-end expiry and a stable funding-event reference; payment/subscription activation itself remains future billing work.

Reserve first-expiring grants first, with non-expiring grants last; tie-break by creation time and UUID. A grant's remaining amount includes its reserved portion. Expiry removes only unreserved funds. Validly reserved funds stay pinned through expiry while the provider outcome is unresolved. Settlement consumes the oldest allocated grants first, releases the unconsumed portion, then expires any newly freed expired funds. Refund restores consumed amounts to the original grants; their original expiry still applies, so expired credit does not become spendable again.

Expiry is applied transactionally on balance/grant reads, reservations, settlement/release/refund and debit adjustments. No expired free credit can pass reservation admission. UI/query caches can briefly display an older balance; backend admission remains authoritative.

Wallet creation and all financial operations acquire a workspace-derived advisory lock and account row lock. Public mutations also lock/revalidate the workspace. Each reservation stores grant allocations. Settlement/release/refund are terminal, idempotent state transitions; conflicting retry amounts are rejected. Refunds are full compensating operations once per settled reservation. Debit adjustments consume only unreserved funds. Positive adjustments create ADMIN grants. All admin attempts require an independently authenticated, active verified SUPER_ADMIN and include reason/evidence audit, with replay metadata.

Funding reference uniqueness for SUBSCRIPTION/PURCHASE/PROMOTIONAL prevents duplicate issuance even if a caller changes the idempotency key. A repeated operation key with changed financial inputs is a conflict. References identify funding events (for example workspace + subscription period, purchase receipt line, promotional award event), not a reusable campaign name.

## Database invariants

Ledger records both balance amount and reservedDelta. RESERVE/RELEASE have zero balance change and nonzero hold change; USAGE reduces balance and releases the entire hold; REFUND compensates prior usage; EXPIRY removes expired free units. History cannot update/delete.

Deferred constraint triggers verify at commit:

- account balance = sum of grant remaining = sum of ledger balance changes;
- account reserved = sum of grant reserved = sum of HELD reservations = sum of ledger hold changes;
- every reservation amount = sum of original allocations.

Checks prevent negative funds, over-reservation, invalid grant bounds, negative spend buckets and impossible settlement amounts. Composite tenant FKs prevent allocations from another workspace. Grant origins, reservation origins/final settlements, settled allocation consumption and generation request/pricing snapshots are immutable. AiUsage and audit remain append-only. Operation amounts are bounded to 10^18 units; database signed BIGINT overflow fails the transaction, never wraps.

Migrations 20261104000500_ai_credits and 20261104000501_credit_funding_reference are additive and execute inside explicit transactions. Existing valid unreserved balances with matching journal totals receive LEGACY grant allocations without changing their ledger/balance. Legacy reservations or inconsistent journals stop migration for explicit reconciliation; the migration does not invent historical allocations or delete history. Funding-reference duplicates likewise require reconciliation. Applied migration files are immutable.

## Gateway protocol

Internal `generate(workspaceId,userId,input,signal?)` runtime-validates task/prompt/optional brand ID/output limit/operation key. It checks active verified identity and OWNER/ADMIN/EDITOR membership, freezes the current validated Brand Kit context for this request, routes by task and validates bounds. VIEWER and foreign workspace IDs are denied. Retries bind to a fingerprint of the original request, not newly changed brand/config state; existing intents are returned without resending.

Under global admission/workspace/wallet locks: reserve worst-case provider spend in global + workspace UTC-day buckets, enforce requests/minute and concurrent open intents (including UNKNOWN), create a unique intent and reserve credits. Any failure rolls everything back before a generating provider call. Text reservations conservatively price the entire configured input ceiling plus chosen bounded output, rather than trusting a frontend token estimate. The actual input is checked using a UTF-8 byte upper bound plus a single-message framing allowance. Routes must use compatible, reviewed tokenizer/context bounds.

Before dispatch, recheck live authorization, kill policies, provider health and intent lease; claim RUNNING once. Calls use bounded HTTP responses, timeout/AbortSignal, no redirect, no automatic POST retry/fallback, one output, server-selected model and output limit. X-Client-Request-Id is a correlation ID, not an assumed provider deduplication guarantee. Prompts and credentials are not logged or included in history endpoints. Request prompts are not durably stored; generation output is retained privately for internal replay.

Successful measured usage is validated against the frozen bounds. Usage insertion, credit settlement, spend reconciliation and terminal intent status commit together. Provider cost snapshots never come from client input. Refunding workspace credit does not erase actual provider cost from spending caps.

Daily costs are attributed to the original UTC admission day. Late resolution updates that same bucket, not the current day's totals. Caps count actual settled spend plus worst-case unresolved commitments. Lowering a cap keeps existing obligations and blocks future admission. Global/workspace kill switches block new dispatch admission; requests already admitted/in flight may still incur their reserved worst-case cost. Local cancellation cannot promise a remote provider refund.

## Uncertain outcomes and recovery

| Outcome | Wallet/spend action |
| --- | --- |
| Validation, permissions, insufficient funds, cap/rate/concurrency failure | no provider generation; no committed reservation |
| Definitive provider rejection (400/401/403/404/422/429) under the compatible provider contract | release credit and spend hold; FAILED |
| Timeout, network/cancellation after send, 408/5xx, malformed success/missing usage | UNKNOWN; retain full credit/spend hold; never resend automatically |
| Usage outside frozen bounds or settlement failure | retain hold, mark UNKNOWN, disable global admission for investigation |
| Crash before dispatch; QUEUED lease expires | CANCELLED and release atomically |
| Crash after dispatch; RUNNING deadline expires | UNKNOWN and retain holds |

Every 30 seconds each API instance scans bounded stale intents; accounting locks make repeated recovery safe. UNKNOWN has no automatic refund TTL. An administrator reconciles it using verified provider evidence: UNBILLED releases; BILLED supplies token counts, with cost recomputed from original server pricing. Repeated equal outcomes are idempotent; contradictory outcomes or usage exceeding the original bounds are rejected. Provider charges above an admitted contract/bound require investigation and an explicit business adjustment; no automatic unreserved user debit is made. Accounting completion/recovery can operate on archived workspaces so incurred liabilities are not stranded by access changes.

Monitor UNKNOWN usage, reconciliation audit, provider health and recovery-error logs. Background health persistence/recovery failures log generic errors without credentials. Production alerting, load limits, process-failure drills and invoice-level reconciliation remain deployment/release work.

## Provider configuration and activation

AI_ENABLED defaults false; AI_ROUTING_CONFIG defaults to empty providers/models; no fake model, price or initial credit is seeded. Configure external secrets through names matching AI_SECRET_*; JSON contains keyEnv names, never secret values. Providers require canonical HTTPS baseUrl without credentials/query/fragment/trailing slash. Loopback HTTP is permitted only in NODE_ENV=test. Missing configured credentials while enabled fail startup.

Routing JSON has `providers[{id,baseUrl,keyEnv}]` and `models[{id,provider,model,priceVersion,capability,tasks,maxInputTokens,maxOutputTokens,contextTokens,inputMicrosPerMillion,outputMicrosPerMillion,imagePriceMicros}]`. Tasks are TEXT_GENERATION/SUMMARIZE/TRANSLATE/IMAGE_GENERATION; exactly one route per configured task, no fallback. Prices are reviewed integer strings. Use pinned models and verify contractual token/context/pricing bounds before enabling them. No model names or prices are selected automatically.

Text adapter uses the OpenAI-compatible Chat Completions contract with max_completion_tokens, non-streaming single text output and returned usage. The official parameter covers visible output and reasoning tokens. [Official Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

Image abstraction/adapter supports IMAGE_FIXED_PRICE only for a compatible provider with a verified flat tariff for one low-quality 1024×1024 PNG. It accepts only inline base64, never follows a provider URL. Token-priced OpenAI GPT Image and retired DALL-E model names are explicitly rejected for this flat-price path; api.openai.com image routes are not enabled. The official Images contract does not offer the text adapter's enforceable output-token limit, so this phase does not pretend its token-priced image calls have a verified flat worst-case bill. [Official Images reference](https://developers.openai.com/api/reference/resources/images/methods/generate). A future token-priced image adapter needs a verified enforceable accounting bound before activation.

Activation order: apply migrations → inject reviewed routing/prices/secrets/conversion rate → enable AI environment gate → inspect authenticated non-generating provider health → configure global and workspace policies with explicit caps → grant verified funding-source credits. An unprovisioned/disabled policy or zero cap denies generation. Normal startup does not create balances, enable policies or call generating endpoints.

## API and minimal UI

All routes use existing JSON envelopes/request IDs and decimal strings for financial fields. No endpoint accepts model/provider prices, wallet balances or charges from a member.

| Method | API-relative path | Authorization |
| --- | --- | --- |
| GET | workspaces/:w/credits/balance | member; applies expiry |
| GET | workspaces/:w/credits/ledger; credits/grants | member; scoped keyset paging |
| POST | workspaces/:w/ai/estimate | editor+; no generation or reservation |
| GET | workspaces/:w/ai/usage | member; statuses/holds/usage only, no prompts/output |
| POST | admin/workspaces/:w/credits/grants | system admin + reason/reference/operation key |
| POST | admin/workspaces/:w/credits/adjustments | system admin + signed integer/reason/key |
| POST | admin/workspaces/:w/credits/refunds/:generation | system admin + evidence |
| POST | admin/workspaces/:w/credits/reconcile | system admin; checks wallet journal |
| PUT | admin/ai/policy; admin/workspaces/:w/ai/policy | system admin; enabled/dailyCapMicros/requestsPerMinute/maxConcurrent |
| POST | admin/workspaces/:w/ai/reconcile/:generation | system admin; UNKNOWN outcome/evidence/usage |
| GET | admin/ai/providers | system admin; non-generating health probes/routes |

`/w/:workspaceId/credits` shows real balances and paged ledger/grants/usage, exact integer localization, vi/en, empty/error/loading states and refresh. No content generator, fake purchase/upgrade control or seeded business usage is present.

Verification commands: npm run verify; test:finance; test:integration; test:auth; test:catalog; test:browser; BROWSER_MODE=production test:browser; infra:up; test:stack. Finance QA uses real isolated PostgreSQL and real HTTP protocol fixtures; it does not claim live paid provider calls. See PROJECT_STATE/PHASE_LOG for executed evidence and FILES_CHANGED for paths. Hosted CI configuration includes finance QA but has not been run from this workspace.
