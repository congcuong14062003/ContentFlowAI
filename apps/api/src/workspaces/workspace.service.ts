import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type WorkspaceRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../platform/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../identity/mail.service';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/auth.guard';
import { digest, token } from '../identity/crypto';
import { canGrant, requireManager } from './workspace.policy';
import type { InvitationDto } from './workspace.dto';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
type Tx = Prisma.TransactionClient;
const invitationView = { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } as const;

@Injectable()
export class WorkspaceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuditService) private readonly audit: AuditService, @Inject(MailService) private readonly mail: MailService, @Inject(ConfigService) private readonly config: ConfigService, @Inject(IdentityService) private readonly identity: IdentityService) {}
  private async member(tx: Tx, workspaceId: string, userId: string) {
    const membership = await tx.membership.findFirst({ where: { workspaceId, userId, workspace: { archivedAt: null } } });
    if (!membership) throw new NotFoundException();
    return membership;
  }
  async authorize(tx: Tx, workspaceId: string, userId: string, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    return (await this.member(tx, workspaceId, userId)).role;
  }
  async lockForAdministration(tx: Tx, workspaceId: string) {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    if (!await tx.workspace.findFirst({ where: { id: workspaceId, archivedAt: null }, select: { id: true } })) throw new NotFoundException();
  }
  async lockForAccounting(tx: Tx, workspaceId: string) {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    if (!await tx.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })) throw new NotFoundException();
  }
  private async mutate<T>(workspaceId: string, userId: string, requestId: string, action: string, fn: (tx: Tx, role: WorkspaceRole) => Promise<T>) {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId}::uuid FOR UPDATE`;
        const member = await this.member(tx, workspaceId, userId);
        const result = await fn(tx, member.role);
        await this.audit.record(tx, { actorId: userId, workspaceId, action, entityType: 'workspace', entityId: workspaceId, requestId });
        return result;
      });
    } catch (error) {
      // Log rejected privileged attempts outside the rolled-back mutation.
      if (error instanceof Error && ['ForbiddenException', 'NotFoundException'].includes(error.name)) await this.audit.record(this.db, { actorId: userId, action: `${action}.denied`, entityType: 'workspace', entityId: workspaceId, requestId });
      throw error;
    }
  }
  async list(userId: string, query: PageQuery = new PageQuery()) {
    const scope = `workspaces:${userId}`;
    const rows = await this.db.membership.findMany({ where: { userId, workspace: { archivedAt: null }, ...pageRange(query, scope) }, select: { id: true, createdAt: true, role: true, workspace: { select: { id: true, name: true, slug: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1 });
    return cursorPage(rows, query, scope);
  }
  async create(userId: string, name: string, requestId: string) {
    return this.db.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: name.trim(), slug: `workspace-${randomUUID()}`, memberships: { create: { userId, role: 'OWNER' } } } });
      await this.audit.record(tx, { actorId: userId, workspaceId: workspace.id, action: 'workspace.created', entityType: 'workspace', entityId: workspace.id, requestId });
      return workspace;
    });
  }
  async get(workspaceId: string, userId: string) { const member = await this.member(this.db, workspaceId, userId); const workspace = await this.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }); return { ...workspace, role: member.role }; }
  update(id: string, userId: string, name: string, requestId: string) { return this.mutate(id, userId, requestId, 'workspace.updated', async (tx, role) => { requireManager(role); return tx.workspace.update({ where: { id }, data: { name: name.trim() } }); }); }
  setTimezone(id: string, userId: string, timezone: string, requestId: string) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw new BadRequestException('Invalid IANA timezone'); }
    return this.mutate(id,userId,requestId,'workspace.timezone_updated',async(tx,role)=>{requireManager(role);return tx.workspace.update({where:{id},data:{timezone}});});
  }
  async members(id: string, userId: string, query: PageQuery = new PageQuery()) {
    await this.member(this.db, id, userId); const scope = `members:${id}`;
    const rows = await this.db.membership.findMany({ where: { workspaceId: id, ...pageRange(query, scope) }, select: { id: true, createdAt: true, userId: true, role: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1 });
    const profiles = new Map((await this.identity.publicProfiles(rows.map((row) => row.userId))).map((user) => [user.id, user]));
    return cursorPage(rows.map((row) => ({ ...row, user: profiles.get(row.userId)! })), query, scope);
  }
  changeRole(id: string, userId: string, targetId: string, next: 'ADMIN' | 'EDITOR' | 'VIEWER', requestId: string) {
    return this.mutate(id, userId, requestId, 'membership.role_changed', async (tx, role) => {
      const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: targetId } } });
      if (!target) throw new NotFoundException(); canGrant(role, next, target.role);
      return tx.membership.update({ where: { id: target.id }, data: { role: next }, select: { id: true, userId: true, role: true } });
    });
  }
  remove(id: string, userId: string, targetId: string, requestId: string) {
    return this.mutate(id, userId, requestId, 'membership.removed', async (tx, role) => {
      const target = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: targetId } } });
      if (!target) throw new NotFoundException(); canGrant(role, 'VIEWER', target.role);
      await tx.membership.delete({ where: { id: target.id } }); return { removed: true };
    });
  }
  async invitations(id: string, userId: string, query: PageQuery = new PageQuery()) {
    const member = await this.member(this.db, id, userId); requireManager(member.role); const scope = `invitations:${id}`;
    return cursorPage(await this.db.invitation.findMany({ where: { workspaceId: id, ...pageRange(query, scope, true) }, select: invitationView, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 }), query, scope);
  }
  async invite(id: string, userId: string, dto: InvitationDto, requestId: string) {
    const raw = token();
    return this.mutate(id, userId, requestId, 'invitation.created', async (tx, role) => {
      canGrant(role, dto.role);
      const invitation = await tx.invitation.create({ data: { workspaceId: id, email: dto.email, role: dto.role, invitedById: userId, tokenHash: digest(raw), expiresAt: new Date(Date.now() + 7 * 86400000) }, select: invitationView });
      await this.mail.enqueue(tx, invitation.id, dto.email, 'ContentFlow AI: workspace invitation', `${this.config.get<string>('WEB_ORIGIN')}/invitations/accept#token=${raw}`);
      return invitation;
    });
  }
  revoke(id: string, userId: string, invitationId: string, requestId: string) {
    return this.mutate(id, userId, requestId, 'invitation.revoked', async (tx, role) => {
      requireManager(role);
      const count = await tx.invitation.updateMany({ where: { id: invitationId, workspaceId: id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!count.count) throw new NotFoundException(); return { revoked: true };
    });
  }
  async accept(raw: string, user: Principal, requestId: string) {
    const invitation = await this.db.invitation.findUnique({ where: { tokenHash: digest(raw) } });
    if (!invitation || invitation.email !== user.email || !user.emailVerifiedAt) throw new UnauthorizedException('Invalid invitation');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${invitation.workspaceId}::uuid FOR UPDATE`;
      const workspace = await tx.workspace.findFirst({ where: { id: invitation.workspaceId, archivedAt: null } });
      if (!workspace) throw new NotFoundException();
      // Revalidate inviter authority so old invitations cannot bypass a demotion/removal.
      const inviter = await this.member(tx, invitation.workspaceId, invitation.invitedById);
      canGrant(inviter.role, invitation.role);
      const existingMember = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } } });
      const activePlan = await tx.subscription.findFirst({ where: { workspaceId: invitation.workspaceId, status: 'ACTIVE' }, include: { plan: { select: { memberLimit: true } } } });
      if (!existingMember && activePlan && await tx.membership.count({ where: { workspaceId: invitation.workspaceId } }) >= activePlan.plan.memberLimit) throw new ConflictException('Workspace member limit reached');
      const result = await tx.invitation.updateMany({ where: { id: invitation.id, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (!result.count) throw new UnauthorizedException('Invalid invitation');
      await tx.membership.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } }, create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role }, update: {} });
      await this.audit.record(tx, { actorId: user.id, workspaceId: invitation.workspaceId, action: 'invitation.accepted', entityType: 'invitation', entityId: invitation.id, requestId });
      return { workspaceId: workspace.id };
    });
  }
}
