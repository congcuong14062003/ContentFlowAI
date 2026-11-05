ALTER TABLE "Brand" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "deletedAt" TIMESTAMPTZ(3), ADD COLUMN "logoAssetId" UUID;
CREATE UNIQUE INDEX "Brand_one_default" ON "Brand" ("workspaceId") WHERE "isDefault" AND "deletedAt" IS NULL;
UPDATE "Brand" b SET "isDefault" = true WHERE b.id = (SELECT x.id FROM "Brand" x WHERE x."workspaceId" = b."workspaceId" ORDER BY x."createdAt", x.id LIMIT 1);
CREATE INDEX "Brand_workspaceId_deletedAt_createdAt_id_idx" ON "Brand" ("workspaceId", "deletedAt", "createdAt", id);
CREATE TABLE "WorkspaceEntitlement" (
 "workspaceId" UUID PRIMARY KEY REFERENCES "Workspace"(id) ON DELETE RESTRICT,
 "brandLimit" INTEGER NOT NULL CHECK ("brandLimit" BETWEEN 0 AND 1000)
);
CREATE TABLE "Product" (
 id UUID PRIMARY KEY, "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id) ON DELETE RESTRICT,
 name VARCHAR(150) NOT NULL, description VARCHAR(10000) NOT NULL DEFAULT '', "priceReference" VARCHAR(200) NOT NULL DEFAULT '',
 features TEXT[] NOT NULL, benefits TEXT[] NOT NULL, audiences TEXT[] NOT NULL, categories TEXT[] NOT NULL, tags TEXT[] NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 "deletedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE ("workspaceId", id)
);
CREATE INDEX "Product_workspaceId_deletedAt_status_createdAt_id_idx" ON "Product" ("workspaceId", "deletedAt", status, "createdAt", id);
CREATE TABLE "ProductBrand" (
 "workspaceId" UUID NOT NULL, "productId" UUID NOT NULL, "brandId" UUID NOT NULL,
 PRIMARY KEY ("workspaceId", "productId", "brandId"),
 FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product" ("workspaceId", id) ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand" ("workspaceId", id) ON DELETE RESTRICT
);
CREATE INDEX "ProductBrand_workspaceId_brandId_productId_idx" ON "ProductBrand" ("workspaceId", "brandId", "productId");
CREATE TABLE "CatalogAsset" (
 id UUID PRIMARY KEY, "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id) ON DELETE RESTRICT,
 "brandId" UUID, "productId" UUID, "storageKey" VARCHAR(512) NOT NULL UNIQUE,
 "originalName" VARCHAR(200) NOT NULL, "mimeType" VARCHAR(32) NOT NULL CHECK ("mimeType" IN ('image/png','image/jpeg','image/webp')),
 size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 5242880), status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','FAILED','DELETED')),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("brandId" IS NULL) <> ("productId" IS NULL)), UNIQUE ("workspaceId", id),
 FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand" ("workspaceId", id) ON DELETE RESTRICT,
 FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product" ("workspaceId", id) ON DELETE RESTRICT
);
CREATE INDEX "CatalogAsset_workspaceId_brandId_status_idx" ON "CatalogAsset" ("workspaceId", "brandId", status);
CREATE INDEX "CatalogAsset_workspaceId_productId_status_idx" ON "CatalogAsset" ("workspaceId", "productId", status);
-- Logo must refer to an asset in the same workspace and owned by this brand.
CREATE UNIQUE INDEX "CatalogAsset_workspace_brand_id" ON "CatalogAsset" ("workspaceId", "brandId", id);
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logo_owned" FOREIGN KEY ("workspaceId", id, "logoAssetId") REFERENCES "CatalogAsset" ("workspaceId", "brandId", id) ON DELETE RESTRICT;
