CREATE TABLE "MediaQuota" (
  "workspaceId" UUID NOT NULL,
  "limitBytes" BIGINT NOT NULL,
  CONSTRAINT "MediaQuota_pkey" PRIMARY KEY ("workspaceId"),
  CONSTRAINT "MediaQuota_limitBytes_check" CHECK ("limitBytes" >= 0)
);

CREATE TABLE "MediaFolder" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "folderId" UUID,
  "storageKey" VARCHAR(512) NOT NULL,
  "thumbnailKey" VARCHAR(512),
  "originalName" VARCHAR(200) NOT NULL,
  "mimeType" VARCHAR(32) NOT NULL,
  "size" INTEGER NOT NULL,
  "thumbnailSize" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source" VARCHAR(16) NOT NULL DEFAULT 'UPLOAD',
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MediaAsset_size_check" CHECK ("size" > 0 AND "size" <= 20971520),
  CONSTRAINT "MediaAsset_thumbnailSize_check" CHECK ("thumbnailSize" >= 0 AND "thumbnailSize" <= 1048576),
  CONSTRAINT "MediaAsset_dimensions_check" CHECK ("width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096),
  CONSTRAINT "MediaAsset_source_check" CHECK ("source" IN ('UPLOAD', 'AI')),
  CONSTRAINT "MediaAsset_status_check" CHECK ("status" IN ('PENDING', 'READY', 'FAILED', 'DELETING', 'DELETED'))
);

CREATE UNIQUE INDEX "MediaFolder_workspaceId_id_key" ON "MediaFolder"("workspaceId", "id");
CREATE UNIQUE INDEX "MediaFolder_workspaceId_name_key" ON "MediaFolder"("workspaceId", "name");
CREATE INDEX "MediaFolder_workspaceId_createdAt_id_idx" ON "MediaFolder"("workspaceId", "createdAt", "id");
CREATE UNIQUE INDEX "MediaAsset_workspaceId_id_key" ON "MediaAsset"("workspaceId", "id");
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE UNIQUE INDEX "MediaAsset_thumbnailKey_key" ON "MediaAsset"("thumbnailKey");
CREATE INDEX "MediaAsset_workspaceId_status_createdAt_id_idx" ON "MediaAsset"("workspaceId", "status", "createdAt", "id");
CREATE INDEX "MediaAsset_workspaceId_folderId_status_idx" ON "MediaAsset"("workspaceId", "folderId", "status");

ALTER TABLE "MediaQuota" ADD CONSTRAINT "MediaQuota_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_folderId_fkey" FOREIGN KEY ("workspaceId", "folderId") REFERENCES "MediaFolder"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
