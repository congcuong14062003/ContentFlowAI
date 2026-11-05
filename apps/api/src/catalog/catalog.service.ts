import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type WorkspaceRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../platform/prisma.service';
import { StorageService } from '../platform/storage.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { AuditService } from '../audit/audit.service';
import { cursorPage, pageRange } from '../common/pagination';
import { BrandDto, CatalogQuery, normalizeBrandKit, parseBrandKit, ProductDto } from './catalog.dto';
import { validateImage, type ImageUpload } from './image-validation';
type Tx = Prisma.TransactionClient;
type Kind = 'brands' | 'products';
const assetView = { id: true, originalName: true, mimeType: true, size: true } as const;
const relations = { assets: { where: { status: 'READY' }, select: assetView } } as const;
export function requireCatalogWriter(role: WorkspaceRole, manager = false) {
  if (role === 'VIEWER' || (manager && !['OWNER', 'ADMIN'].includes(role))) throw new ForbiddenException();
}
@Injectable()
export class CatalogService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(AuditService) private readonly audit: AuditService, @Inject(StorageService) private readonly storage: StorageService, @Inject(ConfigService) private readonly config: ConfigService) {}
  private limit(tx: Tx, workspaceId: string) { return tx.workspaceEntitlement.findUnique({ where: { workspaceId } }).then(row => row?.brandLimit ?? this.config.get<number>('DEFAULT_BRAND_LIMIT', 1)); }
  private async mutate<T>(workspaceId: string, userId: string, action: string, entityId: string | undefined, fn: (tx: Tx) => Promise<T>, manager = false) {
    try {
      return await this.db.$transaction(async tx => {
        requireCatalogWriter(await this.workspaces.authorize(tx, workspaceId, userId, true), manager);
        const result = await fn(tx);
        const resultId = result && typeof result === 'object' && 'id' in result && typeof result.id === 'string' ? result.id : undefined;
        await this.audit.record(tx, { actorId: userId, workspaceId, action, entityType: 'catalog', entityId: entityId ?? resultId });
        return result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Name already exists in this workspace');
      throw error;
    }
  }
  private async resource(tx: Tx, workspaceId: string, kind: Kind, id: string) {
    const row = kind === 'brands' ? await tx.brand.findFirst({ where: { id, workspaceId, deletedAt: null } }) : await tx.product.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!row) throw new NotFoundException(); return row;
  }
  async allowance(workspaceId: string, userId: string) {
    return this.db.$transaction(async tx => { await this.workspaces.authorize(tx, workspaceId, userId); return { brandLimit: await this.limit(tx, workspaceId), brandsUsed: await tx.brand.count({ where: { workspaceId, deletedAt: null } }) }; });
  }
  async list(workspaceId: string, userId: string, kind: Kind, query: CatalogQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId);
      const scope = createHash('sha256').update(JSON.stringify([workspaceId, kind, query.search ?? '', query.status ?? '', query.brandId ?? '', query.category ?? '', query.tag ?? ''])).digest('hex');
      const where = { workspaceId, deletedAt: null, name: query.search ? { contains: query.search, mode: 'insensitive' as const } : undefined, ...pageRange(query, scope) };
      const paging = { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }], take: query.limit + 1 };
      if (kind === 'brands') return cursorPage(await tx.brand.findMany({ where, ...paging }), query, scope);
      return cursorPage(await tx.product.findMany({ where: { ...where, status: query.status, categories: query.category ? { has: query.category } : undefined, tags: query.tag ? { has: query.tag } : undefined, brands: query.brandId ? { some: { brandId: query.brandId, brand: { deletedAt: null } } } : undefined }, include: { brands: { where: { brand: { deletedAt: null } }, select: { brandId: true } } }, ...paging }), query, scope);
    });
  }
  async detail(workspaceId: string, userId: string, kind: Kind, id: string) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId); await this.resource(tx, workspaceId, kind, id);
      if (kind === 'brands') return tx.brand.findUniqueOrThrow({ where: { id }, include: relations });
      return tx.product.findUniqueOrThrow({ where: { id }, include: { ...relations, brands: { where: { brand: { deletedAt: null } }, select: { brandId: true } } } });
    });
  }
  async brandContext(workspaceId: string, userId: string, id: string) {
    const brand = await this.detail(workspaceId, userId, 'brands', id);
    if (!('guidelines' in brand)) throw new NotFoundException();
    return { brandId: brand.id, name: brand.name, kit: normalizeBrandKit(brand.guidelines) };
  }
  async generatorContext(workspaceId: string, userId: string, brandId: string, productIds: string[]) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId);
      const brand = await tx.brand.findFirst({ where: { id: brandId, workspaceId, deletedAt: null } }); if (!brand) throw new NotFoundException();
      const products = await tx.product.findMany({ where: { workspaceId, id: { in: productIds }, deletedAt: null, status: 'ACTIVE', brands: { some: { brandId } } }, select: { id: true, name: true, description: true, priceReference: true, features: true, benefits: true, audiences: true, categories: true, tags: true } });
      if (products.length !== productIds.length) throw new NotFoundException('Unavailable product for selected brand');
      return { brand: { brandId: brand.id, name: brand.name, kit: normalizeBrandKit(brand.guidelines) }, products: productIds.map(id => products.find(product => product.id === id)!) };
    });
  }
  saveBrand(workspaceId: string, userId: string, dto: BrandDto, id?: string) {
    const guidelines = parseBrandKit(dto.guidelines);
    return this.mutate(workspaceId, userId, id ? 'brand.updated' : 'brand.created', id, async tx => {
      if (id) { await this.resource(tx, workspaceId, 'brands', id); return tx.brand.update({ where: { id }, data: { name: dto.name, guidelines } }); }
      const count = await tx.brand.count({ where: { workspaceId, deletedAt: null } });
      if (count >= await this.limit(tx, workspaceId)) throw new ConflictException({ code: 'BRAND_LIMIT', message: 'Brand allowance reached' });
      return tx.brand.create({ data: { id: randomUUID(), workspaceId, name: dto.name, guidelines, isDefault: count === 0 } });
    });
  }
  defaultBrand(workspaceId: string, userId: string, id: string) {
    return this.mutate(workspaceId, userId, 'brand.default_changed', id, async tx => {
      await this.resource(tx, workspaceId, 'brands', id);
      await tx.brand.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } });
      return tx.brand.update({ where: { id }, data: { isDefault: true } });
    }, true);
  }
  logo(workspaceId: string, userId: string, id: string, assetId?: string | null) {
    return this.mutate(workspaceId, userId, 'brand.logo_changed', id, async tx => {
      await this.resource(tx, workspaceId, 'brands', id);
      if (assetId && !await tx.catalogAsset.findFirst({ where: { id: assetId, workspaceId, brandId: id, status: 'READY' } })) throw new NotFoundException();
      return tx.brand.update({ where: { id }, data: { logoAssetId: assetId ?? null } });
    });
  }
  saveProduct(workspaceId: string, userId: string, dto: ProductDto, id?: string) {
    return this.mutate(workspaceId, userId, id ? 'product.updated' : 'product.created', id, async tx => {
      if (id) await this.resource(tx, workspaceId, 'products', id);
      const { brandIds, ...data } = dto;
      if (await tx.brand.count({ where: { id: { in: brandIds }, workspaceId, deletedAt: null } }) !== brandIds.length) throw new BadRequestException('Unavailable brand association');
      const row = id ? await tx.product.update({ where: { id }, data }) : await tx.product.create({ data: { ...data, workspaceId } });
      await tx.productBrand.deleteMany({ where: { workspaceId, productId: row.id } });
      if (brandIds.length) await tx.productBrand.createMany({ data: brandIds.map(brandId => ({ workspaceId, productId: row.id, brandId })) });
      return row;
    });
  }
  remove(workspaceId: string, userId: string, kind: Kind, id: string) {
    return this.mutate(workspaceId, userId, `${kind}.deleted`, id, async tx => {
      const row = await this.resource(tx, workspaceId, kind, id);
      if (kind === 'products') await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
      else {
        await tx.brand.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false, logoAssetId: null } });
        if ('isDefault' in row && row.isDefault) {
          const next = await tx.brand.findFirst({ where: { workspaceId, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
          if (next) await tx.brand.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
      return { removed: true };
    }, kind === 'brands');
  }
  async upload(workspaceId: string, userId: string, kind: Kind, id: string, file?: ImageUpload) {
    const image = validateImage(file); const assetId = randomUUID(); const storageKey = `${workspaceId}/${kind}/${id}/${assetId}.${image.extension}`;
    const owner = kind === 'brands' ? { brandId: id } : { productId: id };
    await this.mutate(workspaceId, userId, 'asset.upload_started', assetId, async tx => {
      await this.resource(tx, workspaceId, kind, id);
      if (await tx.catalogAsset.count({ where: { workspaceId, ...owner, status: { in: ['READY', 'PENDING'] } } }) >= 50) throw new ConflictException('Maximum 50 images per resource');
      return tx.catalogAsset.create({ data: { id: assetId, workspaceId, ...owner, storageKey, originalName: image.originalName, mimeType: image.mimeType, size: file!.size } });
    });
    try {
      await this.storage.put(storageKey, file!.buffer, image.mimeType);
      return await this.mutate(workspaceId, userId, 'asset.uploaded', assetId, async tx => {
        await this.resource(tx, workspaceId, kind, id);
        return tx.catalogAsset.update({ where: { id: assetId }, data: { status: 'READY' }, select: assetView });
      });
    } catch {
      await this.db.catalogAsset.update({ where: { id: assetId }, data: { status: 'FAILED' } });
      await this.storage.remove(storageKey).catch(() => undefined);
      throw new ServiceUnavailableException('Image upload failed');
    }
  }
  async asset(workspaceId: string, userId: string, assetId: string) {
    const asset = await this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId);
      const row = await tx.catalogAsset.findFirst({ where: { id: assetId, workspaceId, status: 'READY' } });
      if (!row) throw new NotFoundException();
      await this.resource(tx, workspaceId, row.brandId ? 'brands' : 'products', (row.brandId ?? row.productId)!); return row;
    });
    try { return { body: await this.storage.read(asset.storageKey), mimeType: asset.mimeType }; }
    catch { throw new ServiceUnavailableException('Image unavailable'); }
  }
  async removeAsset(workspaceId: string, userId: string, id: string) {
    // Soft removal immediately revokes API access; objects remain private for retention/recovery.
    return this.mutate(workspaceId, userId, 'asset.deleted', id, async tx => {
      const asset = await tx.catalogAsset.findFirst({ where: { id, workspaceId, status: 'READY' } });
      if (!asset) throw new NotFoundException();
      await this.resource(tx, workspaceId, asset.brandId ? 'brands' : 'products', (asset.brandId ?? asset.productId)!);
      await tx.brand.updateMany({ where: { workspaceId, logoAssetId: id }, data: { logoAssetId: null } });
      await tx.catalogAsset.update({ where: { id }, data: { status: 'DELETED' } }); return { removed: true };
    });
  }
}
