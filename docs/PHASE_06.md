# Phase 06 — AI Content Generator

User-authorized scope: twelve text marketing tools end-to-end, quote/credit preview, persisted results/history, copy/save/regenerate and draft handoff. Advanced editing and social publishing are not implemented. No live paid provider calls are claimed; real execution requires the Phase 05 operator configuration.

## Modules and data

`generator` owns immutable GeneratorQuote, GeneratorRun and GeneratedDraft links. It calls public workspace/identity authorization, CatalogService.generatorContext, AiGatewayService, CreditsService and ContentDraftService. It does not read identity/membership/catalog/AI/credit tables directly. `content` owns the minimal document/revision persistence interface; it creates DRAFT version 1 plus the first immutable ContentRevision. Phase 07 can consume these rows through the content boundary.

Migration 20261104000600_content_generator is additive and transactional. All quote/run/draft references have same-workspace composite foreign keys. A quote is consumed by at most one run; a run binds to at most one AI intent. Request keys are unique per workspace. Quote snapshots/request origins, validated results and draft links are retained immutably. Each variation can be saved once, enforced by a unique workspace/run/variation key under the workspace lock. Existing migrations/history remain untouched.

Quotes retain normalized input, task/template version 1, exact prompt, validated source snapshot, pricing fingerprint and five-minute expiry. These are private business records, not logs. Source facts/prompts therefore persist in this phase, unlike the generic Phase 05 gateway's prompt-minimizing history. Access is workspace-scoped; production retention/backup policies must account for this data. Do not put credentials in source fields. Future template/schema changes must preserve existing version-1 restore validation.

## Tool registry and contracts

GET tools returns localized vi/en names/descriptions, dedicated form metadata, supported platforms, maximum variations and token budget. Common input: brand ID, up to five active linked product IDs, audience, tone, vi/en language, primary platform, up to three additional platforms, objective, variation count and bounded verified facts. Unknown properties, frontend prices/model overrides, unsupported platform/tool combinations and invalid task-specific parameters are rejected.

| Tool ID | Specific input | Extra validated output |
| --- | --- | --- |
| facebook_post | topic, postStyle | base marketing copy |
| instagram_caption | visualDescription, captionStyle | base marketing copy |
| tiktok_script | topic, durationSeconds 15–90 | ordered non-overlapping scenes within duration |
| product_description | format, emphasis; requires selected product | source-grounded product copy |
| ad_copy | verified offer, AIDA/PAS/BAB framework | base marketing copy |
| video_hooks | topic, hookCount 1–10 | exact number of text/angle items |
| content_ideas | pillar, ideaCount 1–15 | exact number of text/angle items |
| seo_blog | primaryKeyword, angle, targetWords 300–2500 | bounded SEO title/description and outline |
| email_marketing | emailType, message | subject and preheader |
| rewrite | sourceText, rewriteGoal | rewritten copy |
| weekly_plan | theme, ISO startDate | exactly days 1–7 |
| monthly_plan | theme, YYYY-MM | exact calendar days, including leap years |

Base output is `{schemaVersion:1,warnings:[],variations:[]}`. Each variation requires title, hook, mainText, CTA, hashtags, visualConcept and exactly the requested unique platformVariants (primary included). Platform copies are separately validated. Most tools allow up to five variations; TikTok/hooks/ideas up to three, SEO up to two and plans one. Bounded strict JSON parsing rejects extra/missing fields, incorrect counts/platforms and invalid timing/plan order. Markdown JSON fences may be unwrapped; no output is evaluated as executable code or HTML.

Templates explicitly prohibit invented statistics, research, testimonials, quotations, certifications, guarantees, unsupported offers/urgency, citations or URLs. Missing factual support should cause omission and a warning. Brand/product/source/user text is marked untrusted reference material. This is a prompt policy and structural validator, not a guarantee that a model's factual accuracy was independently verified. No extra paid fact-checking model is invoked. Text is rendered safely with Vue interpolation; clipboard output is plain text.

All tools route through the server's TEXT_GENERATION task. Token output budget is the tool's registered budget multiplied by the requested variation count. The gateway validates the serialized input and chosen output limit against the configured model. An undersized route rejects the preview before spending; operators must provision reviewed compatible context/output limits. No fallback model or automatic token-limit increase is selected by the browser. Live model adherence/prompt quality must be evaluated with the operator's configured provider.

## Quote, dispatch and financial state

1. Active verified editor+ requests a preview. Backend validates tool input and same-workspace brand/products, freezes source context, builds the prompt, calls the gateway's server estimator and stores the quote. Products must be active and linked to the selected brand.
2. Creation accepts quoteId and idempotencyKey only. Quote owner, workspace, expiry and single-use rules are enforced. The request/run persists before provider execution; API returns 202 and the browser polls real state without a fabricated percentage.
3. The background application invocation uses a deterministic internal key derived from run UUID. Before a first dispatch, the current server pricing fingerprint must equal the quote's snapshot. If pricing changed/preview expired, fail without a generating call or reservation. Repeated keys return the original run, including after a lost HTTP response.
4. The Phase 05 gateway rechecks active verified editor+ authorization, locks credit/spend/rate policy, reserves worst-case funds, claims one dispatch and performs the real bounded provider call. No public raw-provider proxy is exposed.
5. A trusted server output contract validates the returned text. Valid structured output, measured usage, credit settlement and provider spend commit through the existing engine. Run reads project this durable intent into generator history/result data; it can be rebuilt after an application restart.

If usage is known but content schema is invalid, settlement and full credit compensation happen in the same database transaction: actual provider spend/AiUsage stay recorded, original credit grants receive the refund with their original expiry, and intent/run report OUTPUT_SCHEMA_INVALID / INVALID_OUTPUT. Invalid content cannot be saved. This refund does not imply an external provider refund or resurrect expired credits.

Definitive non-billed rejection releases the hold. Timeout/missing usage/ambiguous transport keeps UNKNOWN holds and follows Phase 05 evidence-based reconciliation, without automatic retry. BILLED reconciliation with no recovered output becomes OUTPUT_UNAVAILABLE; no phantom content can be saved. A projection whose quote expired, has no AI intent and is older than the conservative unstarted-request grace period becomes FAILED/REQUEST_NOT_DISPATCHED with no spending. During a valid quote, explicit resume can safely retry the same deterministic key. Durable BullMQ generation dispatch remains future scope; this phase persists intent/result state and does not claim a durable job queue.

Balances in every run response come from the credit engine, using exact decimal strings. UI refreshes credit queries after requests/status changes. Net charge accounts for an actual refunded reservation. New quote balances take precedence over an older displayed result balance.

## API and authorization

All paths below are relative to `/api/v1/workspaces/:workspaceId/generator`. AuthGuard and live backend membership checks are mandatory. OWNER/ADMIN/EDITOR may preview/generate/resume/save; VIEWER can read workspace history/results/drafts and copy locally. System roles grant no implicit workspace access. Quote creation and run submission/resume use auth throttling in addition to gateway workspace caps/rate/concurrency controls.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | tools | localized tool/form registry |
| POST | quotes | strict tool input → server snapshot/credit estimate/expiry/balance |
| POST | runs | quoteId + operation key → 202 persisted run |
| GET | runs | tenant-scoped keyset history, default 20/max 100 |
| GET | runs/:id | restore/project status, input, validated result, usage, holds, balances, saved links |
| POST | runs/:id/resume | explicit original-actor retry of the same intent key, never a fresh paid retry |
| POST | runs/:id/drafts | variationIndex → one idempotent Content DRAFT/revision |
| GET | drafts/:contentId | authorized read-only saved document |

## Frontend

Protected `/app/create?workspaceId=...` shows the gallery, dynamic dedicated fields, brand/product selectors, audiences, platform adaptations, tone/language/objective/variations, verified facts and real credit preview. Direct `/app/create` asks for a workspace. Workspace switching clears tenant query state and the run selection. Custom selectors, focus styles, form validation, vi/en, responsive cards and loading/empty/error states reuse the design system.

Run URLs contain only workspace/run identifiers; raw prompts/source facts are not put in URLs. A pending operation's quote ID/key is stored in sessionStorage under the current user/workspace solely to recover a lost submission response. No auth token, secret, prompt or model price is stored there. Recovery reuses the operation key. Regenerate creates a fresh server preview, shows the possible new charge and requires an explicit user action; it does not overwrite prior output or replay an UNKNOWN provider call.

Results expose copy, real per-variation draft save and read-only draft view. The saved document has `body.schemaVersion=1`, `kind=generated_marketing`, tool/language/platform, structured variation, warnings and sourceRunId; Content.version and initial revision are 1. There is no rich-text editor or social publishing control in this phase.

## Verification and operational limits

`test:generator` uses isolated real PostgreSQL/Redis and a real local HTTP protocol fixture to exercise all 12 tools, invalid inputs, context, measured charging, refund/rejection/timeout, concurrent idempotency, stale pricing/expiry, role/tenant denial, draft persistence/revisions and Nest application restart restore. Fixture responses exist only under scripts/fixtures, never in production providers. `test:finance`, auth/catalog regression, unit/component and browser dev/production checks supplement this. See PROJECT_STATE and PHASE_LOG for final actual results.

Browser fault injection forwards a generating POST once, drops its browser response and verifies recovery calls the provider once. It uses single-POST interception and waits for route handlers when removing them, per the [Playwright route-removal contract](https://playwright.dev/docs/api/class-page#page-unroute-all). Each isolated browser scenario uses its own test-only auth-throttle namespace so unrelated full-document reload scenarios do not exhaust one refresh bucket. Production rate limits are unchanged.

AI remains disabled with empty real routing until an operator injects valid credentials, reviewed prices/model limits, enabled policies and funded credits. No real paid provider behavior, content-quality/factual evaluation, invoice reconciliation, hosted CI, production load/retention/alerting or public deployment is claimed by local fixture acceptance. Do not start Phase 07 or add an editor/publisher without the next prompt.
