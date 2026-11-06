# Phase 13 — team collaboration and realtime notifications

Updated 2026-11-05. This is an implementation checkpoint, not production signoff.

## Delivered

- Existing workspace invitations and role management now create a persisted in-app invitation for registered recipients and invalidate relevant notification streams after a role change or removal.
- Content records have owner, assignee, reviewer and review requester. Managers assign members with optimistic version checks. Workspace members comment and explicitly mention other members. Content and team audit timelines are paginated and tenant scoped.
- An editor requests review from a different manager. Only the selected reviewer with a current OWNER/ADMIN role can approve or reject; rejection requires a reason, recorded in audit history. The content editor has a collaboration panel with assignment, comments, review actions and history. Team activity has a separate workspace page.
- The notification center stores inbox rows with unique per-user dedupe keys, unread count, cursor pagination, read/unread, mark all read, archive/restore, soft delete, muted event types, optional email and a configurable low-credit threshold. API stream uses authenticated SSE over Redis pub/sub, reconnection and persisted-list resync. Server checks current membership before delivery and on each stream heartbeat.
- Event sources: invitation, assignment, review request/approval/rejection, mention, publishing error, public support reply; worker scans for scheduled reminder, subscription expiry, failed payment and low credit. Worker inserts with dedupe keys, announces after persistence and queues encrypted SMTP email only when configured and opted in.
- Additive migration 14 creates collaboration/inbox records, backfills content ownership from first revisions and imports legacy support reply notifications. No prior migration was edited.

## Authorization and delivery

All content routes authorize workspace membership. Review and assignment checks run inside database transactions against current roles. Inbox reads and mutations require recipient ownership and current workspace membership; invitations are visible to the addressed recipient before joining. Stream fanout sends only IDs, then reloads and authorizes each row. On disconnect the client reconnects with bounded backoff and fetches the persisted inbox. No periodic frontend polling is used.

## Verification

- Full `npm run verify`: passed zero-warning lint, typechecks, 47 tests with 3 opt-in skips, and five builds in the local Docker tooling image.
- Migration 14 applied on disposable PostgreSQL 17; Prisma schema diff: no difference.
- `scripts/test-phase13.mjs`: passed on real PostgreSQL/Redis for role-based review, demotion, rejection audit, comments/mentions, cross-workspace denial, inbox ownership, deduplication, pub/sub delivery, reconnect resync, membership removal and four background events.

## Remaining acceptance and constraints

- No browser or live HTTP/SSE acceptance, configured SMTP delivery test, hosted CI or production migration is claimed. The worker scans at most 500 candidates per source per minute and does not yet have a cursor; larger backlogs need paged processing. Billing still lacks a verified provider webhook, so failed-payment events only reflect stored FAILED payments. Existing Phase 07–12 gaps remain in their checkpoints.
