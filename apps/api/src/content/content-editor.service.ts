import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { PageQuery, cursorPage, pageRange } from '../common/pagination';
import { RestoreContentDto, SaveContentDto } from './content-editor.dto';

@Injectable()
export class ContentEditorService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService) {}
  private async authorize(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, write = false) {
    const role = await this.workspaces.authorize(tx, workspaceId, actorId, write);
    if (write && role === 'VIEWER') throw new ForbiddenException();
    await this.identity.requireActiveVerifiedUser(tx, actorId);
  }
  async list(workspaceId: string, actorId: string, query: PageQuery) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, workspaceId, actorId);
      const rows = await tx.content.findMany({ where: { workspaceId, ...pageRange(query, `content:${workspaceId}`, true) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, select: { id: true, title: true, status: true, brandId: true, version: true, createdAt: true, updatedAt: true } });
      return cursorPage(rows, query, `content:${workspaceId}`);
    });
  }
  async read(workspaceId: string, actorId: string, id: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, workspaceId, actorId);
      const row = await tx.content.findFirst({ where: { workspaceId, id }, select: { id: true, title: true, body: true, status: true, brandId: true, version: true, createdAt: true, updatedAt: true } });
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  async revisions(workspaceId: string, actorId: string, id: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, workspaceId, actorId);
      if (!await tx.content.findFirst({ where: { workspaceId, id }, select: { id: true } })) throw new NotFoundException();
      return tx.contentRevision.findMany({ where: { workspaceId, contentId: id }, orderBy: { version: 'desc' }, select: { version: true, title: true, actorId: true, createdAt: true } });
    });
  }
  async save(workspaceId: string, actorId: string, id: string, dto: SaveContentDto) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, workspaceId, actorId, true);
      const current = await tx.content.findFirst({ where: { workspaceId, id } });
      if (!current) throw new NotFoundException();
      if (current.status !== 'DRAFT') throw new ConflictException('Only drafts can be edited');
      if (current.version !== dto.expectedVersion) throw new ConflictException({ code: 'CONTENT_VERSION_CONFLICT', currentVersion: current.version });
      const original = current.body as Record<string, unknown>;
      if (original.schemaVersion !== 1 || original.kind !== 'generated_marketing' || typeof original.variation !== 'object' || original.variation === null) throw new ConflictException('Unsupported content format');
      const body = { ...original, variation: { ...(original.variation as object), mainText: dto.text } } as Prisma.InputJsonValue;
      const title = dto.title.trim();
      const changed = await tx.content.updateMany({ where: { workspaceId, id, version: dto.expectedVersion, status: 'DRAFT' }, data: { title, body, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'CONTENT_VERSION_CONFLICT' });
      const version = dto.expectedVersion + 1;
      await tx.contentRevision.create({ data: { workspaceId, contentId: id, version, title, actorId, body } });
      await this.audit.record(tx, { workspaceId, actorId, action: 'content.saved', entityType: 'content', entityId: id, metadata: { version } });
      return { id, version, title, body, status: 'DRAFT' as ContentStatus };
    });
  }
  async restore(workspaceId: string, actorId: string, id: string, dto: RestoreContentDto) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, workspaceId, actorId, true);
      const current = await tx.content.findFirst({ where: { workspaceId, id } });
      if (!current) throw new NotFoundException();
      if (current.status !== 'DRAFT') throw new ConflictException('Only drafts can be restored');
      if (current.version !== dto.expectedVersion) throw new ConflictException({ code: 'CONTENT_VERSION_CONFLICT', currentVersion: current.version });
      const revision = await tx.contentRevision.findFirst({ where: { workspaceId, contentId: id, version: dto.version } });
      if (!revision) throw new NotFoundException();
      const title = revision.title ?? current.title;
      const changed = await tx.content.updateMany({ where: { workspaceId, id, version: dto.expectedVersion, status: 'DRAFT' }, data: { title, body: revision.body as Prisma.InputJsonValue, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'CONTENT_VERSION_CONFLICT' });
      const version = dto.expectedVersion + 1;
      await tx.contentRevision.create({ data: { workspaceId, contentId: id, version, title, actorId, body: revision.body as Prisma.InputJsonValue } });
      await this.audit.record(tx, { workspaceId, actorId, action: 'content.restored', entityType: 'content', entityId: id, metadata: { version, sourceVersion: dto.version } });
      return { id, version, title, body: revision.body, status: 'DRAFT' as ContentStatus };
    });
  }
}
