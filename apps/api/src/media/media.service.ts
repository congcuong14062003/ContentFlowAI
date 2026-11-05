import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type WorkspaceRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../platform/prisma.service';
import { StorageService } from '../platform/storage.service';
import { AuditService } from '../audit/audit.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { cursorPage, pageRange } from '../common/pagination';
import { MAX_IMAGE_SIZE, validateImage, type ImageUpload } from '../catalog/image-validation';
import type { Environment } from '../config/environment';
import { FolderDto, MediaEditDto, MediaQuery } from './media.dto';

type Tx = Prisma.TransactionClient;
const occupied = ['PENDING', 'READY', 'DELETING'];
const assetSelect = { id: true, folderId: true, originalName: true, mimeType: true, size: true, thumbnailSize: true, width: true, height: true, tags: true, source: true, status: true, createdAt: true } as const;
function writer(role: WorkspaceRole) { if (role === 'VIEWER') throw new ForbiddenException(); }

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService<Environment, true>
  ) {}

  applyPlanLimit(tx: Tx, workspaceId: string, limitBytes: bigint) { return tx.mediaQuota.upsert({ where: { workspaceId }, create: { workspaceId, limitBytes }, update: { limitBytes } }); }

  private async mutate<T>(workspaceId: string, actorId: string, action: string, entityId: string | undefined, run: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(async tx => {
      writer(await this.workspaces.authorize(tx, workspaceId, actorId, true));
      const result = await run(tx);
      await this.audit.record(tx, { workspaceId, actorId, action, entityType: 'media', entityId });
      return result;
    });
  }

  private async quota(tx: Tx, workspaceId: string) {
    const [override, aggregate] = await Promise.all([
      tx.mediaQuota.findUnique({ where: { workspaceId } }),
      tx.mediaAsset.aggregate({ where: { workspaceId, status: { in: occupied } }, _sum: { size: true, thumbnailSize: true }, _count: { id: true } })
    ]);
    return { limit: override?.limitBytes ?? BigInt(this.config.get('DEFAULT_STORAGE_QUOTA_BYTES')), used: BigInt(aggregate._sum.size ?? 0) + BigInt(aggregate._sum.thumbnailSize ?? 0), count: aggregate._count.id };
  }

  async usage(workspaceId: string, actorId: string) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, actorId);
      const value = await this.quota(tx, workspaceId);
      return { usedBytes: value.used.toString(), limitBytes: value.limit.toString(), assetCount: value.count };
    });
  }

  async folders(workspaceId: string, actorId: string) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, actorId);
      return tx.mediaFolder.findMany({ where: { workspaceId }, select: { id: true, name: true, createdAt: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    });
  }

  async createFolder(workspaceId: string, actorId: string, dto: FolderDto) {
    const name = dto.name.trim(); if (!name) throw new BadRequestException('Folder name is required');
    try { return await this.mutate(workspaceId, actorId, 'media.folder_created', undefined, tx => tx.mediaFolder.create({ data: { workspaceId, name }, select: { id: true, name: true, createdAt: true } })); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Folder name exists'); throw error; }
  }

  async removeFolder(workspaceId: string, actorId: string, folderId: string) {
    return this.mutate(workspaceId, actorId, 'media.folder_deleted', folderId, async tx => {
      if (!await tx.mediaFolder.findFirst({ where: { id: folderId, workspaceId } })) throw new NotFoundException();
      await tx.mediaAsset.updateMany({ where: { workspaceId, folderId }, data: { folderId: null } });
      await tx.mediaFolder.delete({ where: { id: folderId } });
      return { removed: true };
    });
  }

  async list(workspaceId: string, actorId: string, query: MediaQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, actorId);
      if (query.folderId && !await tx.mediaFolder.findFirst({ where: { id: query.folderId, workspaceId } })) throw new NotFoundException();
      const scope = createHash('sha256').update(JSON.stringify([workspaceId, query.search ?? '', query.tag ?? '', query.folderId ?? ''])).digest('hex');
      const rows = await tx.mediaAsset.findMany({ where: { workspaceId, status: { in: ['READY', 'DELETING'] }, folderId: query.folderId, originalName: query.search ? { contains: query.search, mode: 'insensitive' } : undefined, tags: query.tag ? { has: query.tag } : undefined, ...pageRange(query, scope, true) }, select: assetSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
      return cursorPage(rows, query, scope);
    });
  }

  async upload(workspaceId: string, actorId: string, folderId: string | undefined, file?: ImageUpload) {
    const valid = validateImage(file);
    if (file!.size > MAX_IMAGE_SIZE) throw new BadRequestException('Image too large');
    let thumbnail: Buffer;
    try { thumbnail = await sharp(file!.buffer, { limitInputPixels: 4096 * 4096 }).rotate().resize(320, 320, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(); }
    catch { throw new BadRequestException('Image could not be decoded'); }
    if (thumbnail.length > 1048576) throw new BadRequestException('Thumbnail too large');
    const id = randomUUID(); const storageKey = `${workspaceId}/media/${id}.${valid.extension}`; const thumbnailKey = `${workspaceId}/media/${id}-thumb.webp`;
    await this.mutate(workspaceId, actorId, 'media.upload_started', id, async tx => {
      if (folderId && !await tx.mediaFolder.findFirst({ where: { id: folderId, workspaceId } })) throw new NotFoundException();
      const quota = await this.quota(tx, workspaceId);
      if (quota.count >= 1000 || quota.used + BigInt(file!.size + thumbnail.length) > quota.limit) throw new ConflictException({ code: 'STORAGE_QUOTA', message: 'Storage quota exceeded' });
      return tx.mediaAsset.create({ data: { id, workspaceId, folderId, storageKey, thumbnailKey, originalName: valid.originalName, mimeType: valid.mimeType, size: file!.size, thumbnailSize: thumbnail.length, width: valid.width, height: valid.height } });
    });
    try {
      await this.storage.put(storageKey, file!.buffer, valid.mimeType);
      await this.storage.put(thumbnailKey, thumbnail, 'image/webp');
      return await this.mutate(workspaceId, actorId, 'media.uploaded', id, async tx => {
        const row = await tx.mediaAsset.findFirst({ where: { id, workspaceId, status: 'PENDING' } }); if (!row) throw new ConflictException('Upload no longer pending');
        return tx.mediaAsset.update({ where: { id }, data: { status: 'READY' }, select: assetSelect });
      });
    } catch {
      await this.db.mediaAsset.updateMany({ where: { id, workspaceId, status: 'PENDING' }, data: { status: 'FAILED' } });
      await Promise.allSettled([this.storage.remove(storageKey), this.storage.remove(thumbnailKey)]);
      throw new ServiceUnavailableException('Image upload failed');
    }
  }

  async edit(workspaceId: string, actorId: string, id: string, dto: MediaEditDto) {
    return this.mutate(workspaceId, actorId, 'media.updated', id, async tx => {
      if (!await tx.mediaAsset.findFirst({ where: { id, workspaceId, status: 'READY' } })) throw new NotFoundException();
      if (dto.folderId && !await tx.mediaFolder.findFirst({ where: { id: dto.folderId, workspaceId } })) throw new NotFoundException();
      const tags = dto.tags.map(tag => tag.trim()); if (tags.some(tag => !tag) || new Set(tags).size !== tags.length) throw new BadRequestException('Invalid tags');
      return tx.mediaAsset.update({ where: { id }, data: { tags, ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}) }, select: assetSelect });
    });
  }

  async file(workspaceId: string, actorId: string, id: string, thumbnail = false) {
    const asset = await this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, actorId);
      const row = await tx.mediaAsset.findFirst({ where: { id, workspaceId, status: 'READY' } }); if (!row) throw new NotFoundException();
      return row;
    });
    try { return { body: await this.storage.read(thumbnail ? asset.thumbnailKey! : asset.storageKey), mimeType: thumbnail ? 'image/webp' : asset.mimeType, name: asset.originalName }; }
    catch { throw new ServiceUnavailableException('Image unavailable'); }
  }

  async remove(workspaceId: string, actorId: string, id: string) {
    const asset = await this.mutate(workspaceId, actorId, 'media.delete_started', id, async tx => {
      const row = await tx.mediaAsset.findFirst({ where: { id, workspaceId, status: { in: ['READY', 'DELETING'] } } }); if (!row) throw new NotFoundException();
      if (row.status === 'READY') await tx.mediaAsset.update({ where: { id }, data: { status: 'DELETING' } });
      return row;
    });
    try { await this.storage.remove(asset.storageKey); if (asset.thumbnailKey) await this.storage.remove(asset.thumbnailKey); }
    catch { throw new ServiceUnavailableException('Image removal pending; retry deletion'); }
    return this.mutate(workspaceId, actorId, 'media.deleted', id, async tx => {
      await tx.mediaAsset.updateMany({ where: { id, workspaceId, status: 'DELETING' }, data: { status: 'DELETED' } });
      return { removed: true };
    });
  }
}
