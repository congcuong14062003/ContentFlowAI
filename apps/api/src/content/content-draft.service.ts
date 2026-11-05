import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
@Injectable()
export class ContentDraftService {
  constructor(@Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService) {}
  async create(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, brandId: string, title: string, body: Prisma.InputJsonValue, sourceRun: string) {
    if (await this.workspaces.authorize(tx, workspaceId, actorId, true) === 'VIEWER') throw new ForbiddenException();
    await this.identity.requireActiveVerifiedUser(tx, actorId);
    const content = await tx.content.create({ data: { workspaceId, brandId, title, body, status: 'DRAFT', version: 1 } });
    await tx.contentRevision.create({ data: { workspaceId, contentId: content.id, version: 1, title, actorId, body } });
    await this.audit.record(tx, { actorId, workspaceId, action: 'content.draft_created', entityType: 'content', entityId: content.id, metadata: { sourceRun } });
    return { id: content.id, version: content.version };
  }
  async read(tx: Prisma.TransactionClient, workspaceId: string, userId: string, id: string) {
    await this.workspaces.authorize(tx, workspaceId, userId);
    const content = await tx.content.findFirst({ where: { workspaceId, id }, select: { id: true, title: true, body: true, status: true, version: true } });
    if (!content) throw new NotFoundException(); return content;
  }
}
