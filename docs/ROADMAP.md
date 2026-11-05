# Roadmap and acceptance

| Phase | Scope | Depends on | Acceptance gate |
| --- | --- | --- | --- |
| 00 | Skeleton, architecture, ERD, contracts/checkpoints | none | coherent boundaries/config, buildable skeleton |
| 01 | Docker, database, queues, observability, CI | 00 | lint/typecheck/test/build; migration+seed twice; real dependency startup/readiness/shutdown |
| 02 | Vue design system, i18n, shells, accessible primitives | 01 | theme/navigation, keyboard/focus tests, responsive review, no fake metrics |
| 03 | Auth, user, workspace, membership | 01,02 | real browser/API slice; token replay/IDOR/role escalation/tenant isolation tested |
| 04 | Brand kits, product/service catalog, private owned images, brand allowance | 03 | real API/UI CRUD, versioned context, RBAC/tenant isolation, upload and concurrent entitlement tests |
| 05 | AI provider gateway & credit engine (explicit revised prompt) | 03,04 | atomic grants/ledger/reservations/settlement, caps, uncertain-outcome recovery, provider contracts, RBAC/tenant/concurrency tests, minimal credit UI |
| 06 | AI Content Generator: 12 tools, dynamic forms, quotes, structured results/history, copy/save/regenerate | 04,05 | actual gateway/credit/DB slice, schema/tenant/idempotency/refund tests, responsive browser acceptance |
| 07 | Content editor (await explicit prompt) | 06 | generated DRAFT/revision is ready as input; no editor implementation until authorized |
| 08 | Durable asynchronous generation | 06,07 | outbox dispatch, retry/cancel/recovery tests; bounded provider retries |
| 09 | Campaigns and content calendar | 05,08 | tenant-scoped CRUD, scheduling/timezone/permissions tests |
| 10 | Media library/object storage | 03,05 | scoped signed upload/download, MIME/size/path policies, orphan cleanup tests |
| 11 | Plans/subscriptions/payments | 07 | signature verification, webhook replay/order tests, sandbox checkout |
| 12 | Analytics with ECharts | 08,09,11 | real aggregated usage, tenant filtering, accessible empty/error states |
| 13 | System administration | 03,07,11,12 | separate /admin backend role guard, audited operations, denial tests |
| 14 | Notifications/integrations and product hardening | 09–13 | delivery retries/preferences, integration consent, accessibility/e2e checks |
| 15 | Production readiness/release | 00–14 | backup restore, migrations/rollback plan, load/security review, monitoring/runbook |

00–06 were explicitly authorized, with revised 05 gateway/credits and 06 Content Generator scopes. Phase 06 only saves initial drafts/revisions; advanced editor/approval remain future work. The user references editing in 07 but no Phase 07 implementation is authorized yet. Later roadmap rows are planning references; do not start 07–15 automatically. An unexecuted test is never recorded as passed.
