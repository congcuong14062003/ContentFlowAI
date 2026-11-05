# Phase 09 — Media Library and AI Image Studio progress

Phase 09 was explicitly requested. This is a Media Library subphase, not Phase 09 signoff. Phase 07–08 remain incomplete. The user subsequently requested Phase 10 as well.

## Implemented Media Library

Additive `20261105000900_media_library` migration owns `MediaFolder`, `MediaAsset` and `MediaQuota` per workspace. Server checks live membership; OWNER/ADMIN/EDITOR may upload, edit and delete; VIEWER may read. Every lookup includes workspace ID. Files live in private S3, never public URLs. Upload accepts one PNG/JPEG/WebP at most 5 MiB and 4096 × 4096 pixels; the existing signature/MIME/extension validator runs before Sharp decoding. Sharp creates a real 320px WebP thumbnail. Both original and thumbnail bytes count against the configurable default 100 MiB Media Library quota; a workspace row lock serializes concurrent reservations. At most 1000 live/pending/deleting assets per workspace. A future plan limit can use `MediaQuota.limitBytes`.

Folders are workspace scoped. Assets have tags, searchable name/tag/folder, dimensions, MIME, source, size, private thumbnail/file read and authenticated download. List pagination uses a filter-scoped cursor. Deletion first revokes file access, removes both S3 objects and only then releases quota. A storage failure leaves a visible `DELETING` item with retry action. File reads set private/no-store and nosniff headers. All mutations write audit events. Vue `/w/:workspaceId/media` uses the Phase 02 components and vi/en, shows quota, folder creation/deletion, upload, filters, metadata edit, download/delete and responsive thumbnail cards.

This quota currently applies to **MediaAsset** bytes. Existing Phase 04 CatalogAsset storage is outside this counter and continues to use its own per-record upload limit. A unified plan storage entitlement/enforcement across both asset owners belongs to the next dependent subphase; do not advertise the 100 MiB media limit as an all-workspace storage limit.

## Verification performed

- New migration deployed to local PostgreSQL; repeat migration in isolated test schema succeeded; live schema ↔ Prisma datamodel diff exit 0/no difference.
- Full `verify` passed: Prisma generation, zero-warning lint, typechecks, 42 unit/component passed +3 opt-in skipped, and all five builds. A later thumbnail-card layout change passed targeted zero-warning lint and web build.
- `test:media` passed 6/6 against real PostgreSQL and private MinIO: upload restrictions, thumbnail/download, tenant and role denial, folders/tags/search, concurrent quota admission, delete/revocation/audit. Isolated schema and generated S3 keys were cleaned.
- Development Chromium passed 15/15 scenarios, including actual media upload, thumbnail, tags, download, delete and 1440/390 no-overflow. The later card-layout-only change was not browser rerun yet.
- Sharp 0.35.5 installed after an older release raised a high advisory; npm install audit reported zero vulnerabilities. No paid image provider called.

## Remaining Phase 09

- Image Generator: route/provider capability selection, supported aspect/quality/output-count contract and immutable quote, explicit confirmation, durable BullMQ worker, result storage, history, retry/unknown-charge reconciliation and browser tests. The Phase 05 gateway has only a fixed-price one-image adapter; it does **not** provide the required user-selectable dimensions/quality or durable job dispatch yet.
- Design Studio: canvas, layers, shapes/text/images/backgrounds, brand assets/colors/logo, templates, persistence/edit and PNG/JPEG export.
- Unified CatalogAsset/MediaAsset storage accounting and automated reconciliation of interrupted PENDING/DELETING objects.

Do not create UI controls for unimplemented image generation or claim Phase 09 completed. Preserve the applied migration and data.
