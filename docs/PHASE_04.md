# Phase 04 — Brand kit and product catalog

Authorized 2026-11-04: database → API → Vue UI → real dependency/browser acceptance. No AI generation, billing or general media-library workflow is implemented.

## Boundaries and authorization

`catalog` owns Brand, Product, ProductBrand, CatalogAsset and WorkspaceEntitlement. It uses the exported WorkspaceService authorization interface rather than membership tables. Identity guards authenticate live sessions; platform provides Prisma, private S3 and audit. Future consumers use the exported CatalogService and shared transport contracts.

All endpoints are under `/api/v1/workspaces/:workspaceId`. Every member can read. OWNER/ADMIN/EDITOR can create/edit brands/products, archive products, upload/remove images and select logos. Only OWNER/ADMIN can remove a brand or change its default status. VIEWER is read-only; system roles have no implicit workspace bypass. Foreign workspace/resource IDs return 404. Unknown DTO properties are rejected.

Mutations lock the workspace, recheck current membership and audit changes transactionally. This serializes brand quota checks, default changes and role changes. UUIDs/tenant associations are immutable. Composite foreign keys prohibit foreign-tenant product-brand/asset associations and foreign-brand logos.

## Data contracts and lifecycle

Guidelines schema v1: colors (hex), industry, businessDescription, targetAudiences, voice, tone, keywords, forbiddenPhrases, preferredCta, languages (language codes), socialPlatforms and aiInstructions. Runtime validation: catalog.dto.ts; shared TS contract: packages/shared/src/catalog.ts. `GET brands/:id/context` returns `{brandId,name,kit}` with validated versioned context. Legacy empty guidelines receive defaults through this contract; migration never overwrites stored guidelines. Instructions remain data for a future adapter.

First active brand becomes default. Partial unique index allows at most one active default. Removing it atomically chooses the oldest remaining brand. Deletion is soft, preserving content/product references. Existing workspace/name uniqueness is retained, including deleted names; duplicates return 409.

Catalog records represent products/services with shared descriptive fields. Price reference is informational text, never a billing amount. Features, benefits, audiences, categories and tags are bounded arrays; status ACTIVE/ARCHIVED. Many-to-many brands must belong to the workspace. Deleted brands disappear from exposed associations while historical links remain. Product deletion is soft.

Lists use scoped keyset cursors, default 20/max 100. Product filters: case-insensitive name search, status, brandId, exact category and tag. Cursor scope includes tenant, kind and filters. UI lists and brand selectors can load further pages.

## Brand entitlement

WorkspaceEntitlement.brandLimit overrides validated DEFAULT_BRAND_LIMIT (default 1, range 0–1000). This is technical provisioning configuration, not an invented commercial plan. Atomic create/count checks prevent concurrent oversubscription. Limit failure returns 409/BRAND_LIMIT. Lowering a limit retains existing brands and blocks further creation.

`npm run catalog:set-limit` accepts external environment variables ENTITLEMENT_WORKSPACE_ID, ENTITLEMENT_ACTOR_ID, ENTITLEMENT_BRAND_LIMIT. The actor must be an active verified SUPER_ADMIN; the change is audited. No browser endpoint lets workspace members change allowances. Subscription synchronization belongs to Phase 11.

## Private assets

Multipart field `file`, one PNG/JPEG/WebP per request, at most 5 MiB and 4096×4096 pixels, max 50 READY/PENDING assets per record. Validate byte length, MIME/extension agreement, binary signatures/headers, dimensions and bounded structure. SVG, animated WebP and unsupported formats are rejected. This is not malware scanning or full image re-encoding.

Server generates workspace/owner/UUID keys; sanitized filenames are metadata only. Upload reserves PENDING metadata, writes S3 outside the DB transaction, rechecks authorization/owner, then marks READY and audits. Failure marks FAILED and attempts removal of the generated object. Interruption can leave private PENDING/orphan objects; automated reconciliation belongs to the Phase 10 media library.

GET assets/:id authorizes tenant and active owner, then returns binary bytes with fixed validated MIME, nosniff and private/no-store. Browser requests use normal auth refresh and revoke object URLs on change/unmount. CSP permits blob images. Removal marks DELETED, clears logo references and immediately revokes API access. Private objects remain for retention/recovery; operator storage lifecycle policy governs disposal. Removed brands/products also make their assets inaccessible.

## REST API

JSON keeps existing response/error envelopes and request IDs. Binary image reads are the documented exception. Brand/product PATCH replaces the editable representation; send the full validated DTO.

| Method | Workspace-relative suffix | Behavior |
| --- | --- | --- |
| GET | catalog-entitlement | brandLimit, brandsUsed |
| GET/POST | brands | paged list / name + guidelines |
| GET/PATCH/DELETE | brands/:id | detail with READY assets / replacement / soft removal |
| GET | brands/:id/context | version-1 validated context |
| POST | brands/:id/default | manager-only atomic default |
| PATCH | brands/:id/logo | assetId UUID or null, owned by this brand |
| GET/POST | products | filtered list / full product DTO |
| GET/PATCH/DELETE | products/:id | detail with associations / replacement / soft removal |
| POST | brands/:id/assets; products/:id/assets | throttled bounded multipart upload |
| GET/DELETE | assets/:id | authorized binary read / soft removal |

## UI and verification

Workspace navigation adds Brand kits and Products & services. Brand creation/editing uses a four-step wizard, then detail/assets/logo/default controls. Products provide forms, detail, archive status, brand associations, images, filters/search and load-more. Roles control presented actions; API authorization is authoritative. vi/en strings, shared focus/controls, responsive states, no mock production data. Multiline list editing preserves trailing newlines while typing.

Commands: npm run verify, test:catalog, test:auth, test:browser. BROWSER_MODE=production checks built SPA and CSP. Test scripts allocate random local schemas and clean only their own schema/object keys. CI provisions disposable private S3 from pinned official sources and runs catalog plus dev/production browser acceptance. Actual results are in PROJECT_STATE/PHASE_LOG; configuring CI does not prove a hosted CI run.
