# Files changed through Phase 00–06 completion

Project began empty. PHASE_LOG.md groups implementation changes by phase and records real checks. This maintained inventory excludes secrets, dependencies, QA artifacts and generated build output.

```text
.env.example
.dockerignore
.github\workflows\ci.yml
.gitignore
.node-version
.npmrc
.nvmrc
apps\api\package.json
apps\api\prisma\migrations\20261104000100_foundation\invariants.sql.note
apps\api\prisma\migrations\20261104000100_foundation\migration.sql
apps\api\prisma\migrations\20261104000200_identity_sessions\migration.sql
apps\api\prisma\migrations\20261104000300_pagination_outbox_indexes\migration.sql
apps\api\prisma\migrations\migration_lock.toml
apps\api\prisma\schema.prisma
apps\api\prisma\seed.ts
apps\api\src\app.module.ts
apps\api\src\audit\audit.service.ts
apps\api\src\bootstrap.ts
apps\api\src\common\http.spec.ts
apps\api\src\common\http.ts
apps\api\src\common\pagination.spec.ts
apps\api\src\common\pagination.ts
apps\api\src\common\request-context.ts
apps\api\src\config\environment.spec.ts
apps\api\src\config\environment.ts
apps\api\src\health\health.controller.spec.ts
apps\api\src\health\health.controller.ts
apps\api\src\identity\auth.guard.ts
apps\api\src\identity\cookies.spec.ts
apps\api\src\identity\cookies.ts
apps\api\src\identity\crypto.spec.ts
apps\api\src\identity\crypto.ts
apps\api\src\identity\google-identity.spec.ts
apps\api\src\identity\google-identity.ts
apps\api\src\identity\identity.controller.ts
apps\api\src\identity\identity.dto.ts
apps\api\src\identity\identity.module.ts
apps\api\src\identity\identity.service.ts
apps\api\src\identity\mail.service.ts
apps\api\src\identity\oauth.service.spec.ts
apps\api\src\identity\oauth.service.ts
apps\api\src\main.ts
apps\api\src\platform\platform.module.ts
apps\api\src\platform\prisma.service.ts
apps\api\src\platform\redis.service.ts
apps\api\src\platform\storage.service.ts
apps\api\src\workspaces\workspace.controller.ts
apps\api\src\workspaces\workspace.dto.ts
apps\api\src\workspaces\workspace.module.ts
apps\api\src\workspaces\workspace.policy.spec.ts
apps\api\src\workspaces\workspace.policy.ts
apps\api\src\workspaces\workspace.service.ts
apps\api\test\database.integration.spec.ts
apps\api\tsconfig.json
apps\web\index.html
apps\web\package.json
apps\web\src\App.vue
apps\web\src\app\i18n.ts
apps\web\src\app\preferences.ts
apps\web\src\app\query.ts
apps\web\src\app\router.ts
apps\web\src\app\session.ts
apps\web\src\components\PageHeader.vue
apps\web\src\components\ui\primitives.spec.ts
apps\web\src\components\ui\UiButton.vue
apps\web\src\components\ui\UiCard.vue
apps\web\src\components\ui\UiConfirmDialog.vue
apps\web\src\components\ui\UiDataTable.vue
apps\web\src\components\ui\UiDatePicker.vue
apps\web\src\components\ui\UiDialog.vue
apps\web\src\components\ui\UiDrawer.vue
apps\web\src\components\ui\UiInput.vue
apps\web\src\components\ui\UiLoadMore.vue
apps\web\src\components\ui\UiMultiSelect.vue
apps\web\src\components\ui\UiPagination.vue
apps\web\src\components\ui\UiSelect.vue
apps\web\src\components\ui\UiSkeleton.vue
apps\web\src\components\ui\UiState.vue
apps\web\src\components\ui\UiTabs.vue
apps\web\src\components\ui\UiToasts.vue
apps\web\src\features\account\AccountPage.vue
apps\web\src\features\admin\AdminPage.vue
apps\web\src\features\auth\AcceptInvitation.vue
apps\web\src\features\auth\AuthPage.vue
apps\web\src\features\auth\invitation.ts
apps\web\src\features\showcase\ShowcasePage.vue
apps\web\src\features\workspaces\MemberRow.vue
apps\web\src\features\workspaces\WorkspaceSettings.vue
apps\web\src\features\workspaces\WorkspacesPage.vue
apps\web\src\layouts\AppShell.vue
apps\web\src\layouts\AuthLayout.vue
apps\web\src\lib\api.ts
apps\web\src\lib\paged-query.ts
apps\web\src\lib\toasts.ts
apps\web\src\locales\en.ts
apps\web\src\locales\vi.ts
apps\web\src\main.ts
apps\web\src\styles\tokens.css
apps\web\tsconfig.json
apps\web\vite.config.ts
apps\worker\package.json
apps\worker\src\mail-outbox.ts
apps\worker\src\main.ts
apps\worker\src\queue.integration.spec.ts
apps\worker\tsconfig.json
docs\API_CONTRACTS.md
docs\DATABASE.md
docs\FILES_CHANGED.md
docs\MASTER_SPEC.md
docs\NEXT_TASK.md
docs\PHASE_LOG.md
docs\PROJECT_STATE.md
docs\ROADMAP.md
eslint.config.mjs
infrastructure\compose.dev.yml
infrastructure\compose.prod.yml
infrastructure\Dockerfile
infrastructure\nginx.conf
infrastructure\storage.Dockerfile
package-lock.json
package.json
packages\mail\package.json
packages\mail\src\index.spec.ts
packages\mail\src\index.ts
packages\mail\tsconfig.json
packages\shared\package.json
packages\shared\src\index.ts
packages\shared\tsconfig.json
README.md
scripts\bootstrap-admin.ts
scripts\dev-api.mjs
scripts\npm.ps1
scripts\setup-local.mjs
scripts\setup-mail.mjs
scripts\smoke-api.mjs
scripts\stack.mjs
scripts\test-auth.mjs
scripts\test-browser.mjs
scripts\test-integration.mjs
scripts\test-live-stack.mjs
scripts\test-smtp.mjs
scripts\test-storage.mjs
tsconfig.base.json
tsconfig.test.json
vitest.config.mts
```

Local-only: .env credentials, checksum-verified .local/runtime, .local/mail and .local/qa; Docker named volumes retained. Original migrations preserved; later migrations are additive. Temporary test schemas/mailboxes and generated QA objects are cleaned up only within their explicit isolated boundaries.

## Phase 04 changed paths (2026-11-04)

No Git metadata is present, so this is an explicit phase edit inventory rather than a Git diff. Existing migration files were preserved. Ignored .env only gained API_HOST_PORT=53000; secrets, .local test artifacts and dist/node_modules are excluded.

- .env.example
- .github/workflows/ci.yml
- package.json
- README.md
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20261104000400_brand_catalog/migration.sql
- apps/api/src/app.module.ts
- apps/api/src/common/http.ts
- apps/api/src/config/environment.ts
- apps/api/src/platform/storage.service.ts
- apps/api/src/workspaces/workspace.module.ts
- apps/api/src/workspaces/workspace.service.ts
- apps/api/src/catalog/catalog.controller.ts
- apps/api/src/catalog/catalog.dto.ts
- apps/api/src/catalog/catalog.module.ts
- apps/api/src/catalog/catalog.service.ts
- apps/api/src/catalog/catalog.spec.ts
- apps/api/src/catalog/image-validation.ts
- packages/shared/src/catalog.ts
- packages/shared/src/index.ts
- apps/web/src/app/router.ts
- apps/web/src/layouts/AppShell.vue
- apps/web/src/lib/api.ts
- apps/web/src/lib/paged-query.ts
- apps/web/src/components/ui/UiTextarea.vue
- apps/web/src/locales/en.ts
- apps/web/src/locales/vi.ts
- apps/web/src/styles/tokens.css
- apps/web/vite.config.ts
- apps/web/src/features/catalog/AssetManager.vue
- apps/web/src/features/catalog/BrandFields.vue
- apps/web/src/features/catalog/BrandPage.vue
- apps/web/src/features/catalog/CatalogList.vue
- apps/web/src/features/catalog/ListField.vue
- apps/web/src/features/catalog/ProductPage.vue
- apps/web/src/features/catalog/catalog.ts
- apps/web/src/features/catalog/catalog.spec.ts
- infrastructure/compose.dev.yml
- infrastructure/compose.test.yml
- infrastructure/nginx.conf
- scripts/test-catalog.mjs
- scripts/test-browser.mjs
- scripts/test-live-stack.mjs
- scripts/set-brand-limit.ts
- docs/MASTER_SPEC.md
- docs/PROJECT_STATE.md
- docs/PHASE_LOG.md
- docs/NEXT_TASK.md
- docs/PHASE_04.md
- docs/DATABASE.md
- docs/API_CONTRACTS.md
- docs/ROADMAP.md
- docs/FILES_CHANGED.md

## Phase 05 changed paths (2026-11-04)

Explicit phase inventory; repository has no Git metadata. No dependency/library changes; package-lock unchanged. Existing applied migrations were preserved; two new financial migrations added. Ignored secrets, generated dist/node_modules and isolated QA artifacts excluded.

- apps/api/src/ai/ai-gateway.service.ts
- apps/api/src/ai/ai-policy.service.ts
- apps/api/src/ai/ai.config.ts
- apps/api/src/ai/ai.controller.ts
- apps/api/src/ai/ai.dto.ts
- apps/api/src/ai/ai.module.ts
- apps/api/src/ai/openai-compatible.provider.ts
- apps/api/src/ai/pricing.spec.ts
- apps/api/src/ai/pricing.ts
- apps/api/src/ai/provider-registry.service.ts
- apps/api/src/ai/provider.ts
- apps/api/src/credits/credit-wallet.service.ts
- apps/api/src/credits/credits.controller.ts
- apps/api/src/credits/credits.dto.ts
- apps/api/src/credits/credits.module.ts
- apps/api/src/credits/credits.service.ts
- apps/api/src/credits/money.ts
- apps/web/src/features/credits/CreditHistory.vue
- apps/web/src/features/credits/CreditsPage.vue
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20261104000500_ai_credits/migration.sql
- apps/api/prisma/migrations/20261104000501_credit_funding_reference/migration.sql
- apps/api/src/app.module.ts
- apps/api/src/audit/audit.service.ts
- apps/api/src/common/http.ts
- apps/api/src/config/environment.ts
- apps/api/src/identity/identity.module.ts
- apps/api/src/identity/identity.service.ts
- apps/api/src/workspaces/workspace.service.ts
- packages/shared/src/index.ts
- packages/shared/src/credits.ts
- apps/web/src/app/router.ts
- apps/web/src/layouts/AppShell.vue
- apps/web/src/locales/en.ts
- apps/web/src/locales/vi.ts
- scripts/test-finance.mjs
- scripts/test-browser.mjs
- package.json
- .env.example
- .github/workflows/ci.yml
- README.md
- docs/MASTER_SPEC.md
- docs/PROJECT_STATE.md
- docs/PHASE_LOG.md
- docs/NEXT_TASK.md
- docs/PHASE_05.md
- docs/ROADMAP.md
- docs/DATABASE.md
- docs/API_CONTRACTS.md
- docs/FILES_CHANGED.md

## Phase 06 — AI Content Generator

Explicit phase inventory (includes checkpoint updates; no dependency or lockfile changes):

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20261104000600_content_generator/migration.sql
- apps/api/src/app.module.ts
- apps/api/src/ai/output-contract.ts
- apps/api/src/ai/ai-gateway.service.ts
- apps/api/src/catalog/catalog.service.ts
- apps/api/src/credits/credits.module.ts
- apps/api/src/content/content-draft.service.ts
- apps/api/src/content/content.module.ts
- apps/api/src/generator/tool-registry.ts
- apps/api/src/generator/output-contract.ts
- apps/api/src/generator/generator.dto.ts
- apps/api/src/generator/generator.service.ts
- apps/api/src/generator/generator.controller.ts
- apps/api/src/generator/generator.module.ts
- apps/api/src/generator/generator.spec.ts
- packages/shared/src/generator.ts
- packages/shared/src/index.ts
- apps/web/src/features/generator/GeneratorPage.vue
- apps/web/src/features/generator/GeneratorForm.vue
- apps/web/src/features/generator/ResultCards.vue
- apps/web/src/features/generator/generator.ts
- apps/web/src/features/generator/generator.spec.ts
- apps/web/src/app/router.ts
- apps/web/src/layouts/AppShell.vue
- apps/web/src/locales/en.ts
- apps/web/src/locales/vi.ts
- apps/web/src/styles/tokens.css
- scripts/test-generator.mjs
- scripts/fixtures/generator.mjs
- scripts/test-browser.mjs
- package.json
- .github/workflows/ci.yml
- README.md
- docs/MASTER_SPEC.md
- docs/PROJECT_STATE.md
- docs/PHASE_LOG.md
- docs/NEXT_TASK.md
- docs/PHASE_06.md
- docs/ROADMAP.md
- docs/DATABASE.md
- docs/API_CONTRACTS.md
- docs/FILES_CHANGED.md

## Phase 07 foundation in progress (2026-11-05)

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20261105000700_content_revisions/migration.sql
- apps/api/src/content/content-draft.service.ts
- apps/api/src/content/content.module.ts
- apps/api/src/content/content-editor.dto.ts
- apps/api/src/content/content-editor.service.ts
- apps/api/src/content/content-editor.controller.ts
- apps/api/src/app.module.ts
- docs/MASTER_SPEC.md
- docs/PROJECT_STATE.md
- docs/PHASE_LOG.md
- docs/NEXT_TASK.md
- docs/FILES_CHANGED.md

- scripts/test-generator.mjs # Phase 07 integration scenario

