import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../platform/prisma.service';
import { RedisService } from '../platform/redis.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { cursorPage, pageRange } from '../common/pagination';
import { AccountStatusDto, AdminAiUsageQuery, AdminUsersQuery } from './admin.dto';

@Injectable()
export class AdminService implements OnModuleDestroy {
  private readonly queue: Queue;
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(RedisService) redis: RedisService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService) { this.queue = new Queue('platform-health', { connection: redis.client }); }
  async onModuleDestroy() { await this.queue.close(); }

  async overview(actorId: string) {
    await this.db.$transaction(tx => this.identity.requireSystemAdmin(tx, actorId));
    const now = new Date(); const since = new Date(now.getTime() - 30 * 86400000);
    const [totalUsers, activeUsers, newUsers, paidCustomers, subscriptions, generatedContents, aiRequests, errors, credits, cost, media, catalog, plans] = await Promise.all([
      this.db.user.count(),
      this.db.user.count({ where: { disabledAt: null, sessions: { some: { revokedAt: null, expiresAt: { gt: now }, createdAt: { gte: since } } } } }),
      this.db.user.count({ where: { createdAt: { gte: since } } }),
      this.db.subscription.count({ where: { status: 'ACTIVE', plan: { priceMinor: { gt: 0 } } } }),
      this.db.subscription.count({ where: { status: 'ACTIVE' } }),
      this.db.generatedDraft.count(),
      this.db.aiGeneration.count({ where: { createdAt: { gte: since } } }),
      this.db.aiGeneration.count({ where: { createdAt: { gte: since }, status: { in: ['FAILED', 'UNKNOWN'] } } }),
      this.db.aiUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { credits: true } }),
      this.db.aiUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costMicros: true } }),
      this.db.mediaAsset.aggregate({ where: { status: { in: ['PENDING', 'READY', 'DELETING'] } }, _sum: { size: true, thumbnailSize: true } }),
      this.db.catalogAsset.aggregate({ where: { status: { in: ['PENDING', 'READY', 'DELETING'] } }, _sum: { size: true } }),
      this.db.subscription.groupBy({ by: ['planId'], where: { status: 'ACTIVE' }, _count: { id: true } })
    ]);
    const names = await this.db.plan.findMany({ where: { id: { in: plans.map(item => item.planId) } }, select: { id: true, name: true, tier: true } });
    const [userGrowth, subscriptionTrend, usageTrend, providerBreakdown, generationTrend] = await Promise.all([
      this.db.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count FROM "Subscription" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<{ day: Date; requests: bigint; cost: bigint; credits: bigint }[]>`SELECT date_trunc('day', g."createdAt") AS day, count(*)::bigint AS requests, COALESCE(sum(u."costMicros"),0)::bigint AS cost, COALESCE(sum(u."credits"),0)::bigint AS credits FROM "AiGeneration" g LEFT JOIN "AiUsage" u ON u."generationId" = g.id WHERE g."createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<{ provider: string; requests: bigint; cost: bigint }[]>`SELECT g.provider, count(*)::bigint AS requests, COALESCE(sum(u."costMicros"),0)::bigint AS cost FROM "AiGeneration" g LEFT JOIN "AiUsage" u ON u."generationId" = g.id WHERE g."createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<{ day: Date; status: string; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, status::text AS status, count(*)::bigint AS count FROM "AiGeneration" WHERE "createdAt" >= ${since} GROUP BY 1,2 ORDER BY 1`
    ]);
    let queueHealth: { waiting: number; active: number; failed: number; delayed: number; completed: number; reachable: boolean };
    try { const counts = await this.queue.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed'); queueHealth = { waiting: counts.waiting ?? 0, active: counts.active ?? 0, failed: counts.failed ?? 0, delayed: counts.delayed ?? 0, completed: counts.completed ?? 0, reachable: true }; }
    catch { queueHealth = { waiting: 0, active: 0, failed: 0, delayed: 0, completed: 0, reachable: false }; }
    return { window: { from: since, to: now, days: 30 }, definitions: { activeUsers: 'Users with a non-revoked session created in the last 30 days', generatedContents: 'Saved AI-generated drafts', storageUsageBytes: 'Catalog and Media Library objects; Media Library includes thumbnail bytes', errorRate: 'FAILED or UNKNOWN AI generations divided by all AI generations in the last 30 days', queue: 'platform-health BullMQ queue; image generation does not use this queue' }, totals: { totalUsers, activeUsers, newUsers, paidCustomers, subscriptions, generatedContents, aiRequests, creditUsage: credits._sum.credits ?? 0n, providerCostMicros: cost._sum.costMicros ?? 0n, storageUsageBytes: BigInt(media._sum.size ?? 0) + BigInt(media._sum.thumbnailSize ?? 0) + BigInt(catalog._sum.size ?? 0), errorRate: aiRequests ? errors / aiRequests : 0 }, queue: queueHealth, charts: { userGrowth, subscriptionTrend, usageTrend, plans: plans.map(item => ({ ...item, plan: names.find(plan => plan.id === item.planId) })), providerBreakdown, generationTrend } };
  }

  async users(actorId: string, query: AdminUsersQuery) {
    await this.db.$transaction(tx => this.identity.requireSystemAdmin(tx, actorId));
    const scope = `admin-users:${query.search ?? ''}:${query.status ?? 'all'}`;
    const where: Prisma.UserWhereInput = { ...(query.search ? { OR: [{ email: { contains: query.search, mode: 'insensitive' } }, { displayName: { contains: query.search, mode: 'insensitive' } }] } : {}), ...(query.status === 'active' ? { disabledAt: null } : query.status === 'suspended' ? { disabledAt: { not: null } } : {}), ...pageRange(query, scope, true) };
    const rows = await this.db.user.findMany({ where, select: { id: true, email: true, displayName: true, systemRole: true, emailVerifiedAt: true, disabledAt: true, createdAt: true, _count: { select: { memberships: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
    return cursorPage(rows, query, scope);
  }

  async aiUsage(actorId: string, query: AdminAiUsageQuery) {
    await this.db.$transaction(tx => this.identity.requireSystemAdmin(tx, actorId));
    const scope = `admin-ai:${query.provider ?? ''}:${query.status ?? ''}`;
    const rows = await this.db.aiGeneration.findMany({ where: { ...(query.provider ? { provider: query.provider } : {}), ...(query.status ? { status: query.status } : {}), ...pageRange(query, scope, true) }, select: { id: true, workspaceId: true, provider: true, model: true, status: true, errorCode: true, createdAt: true, usage: { select: { inputTokens: true, outputTokens: true, costMicros: true, credits: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
    return cursorPage(rows, query, scope);
  }

  async user(actorId: string, id: string) {
    await this.db.$transaction(tx => this.identity.requireSystemAdmin(tx, actorId));
    const user = await this.db.user.findUnique({ where: { id }, select: { id: true, email: true, displayName: true, language: true, systemRole: true, emailVerifiedAt: true, disabledAt: true, createdAt: true, memberships: { select: { role: true, workspaceId: true, workspace: { select: { name: true } } } } } });
    if (!user) throw new NotFoundException();
    const workspaceIds = user.memberships.map(item => item.workspaceId);
    const [subscriptions, usage, audit] = await Promise.all([
      this.db.subscription.findMany({ where: { workspaceId: { in: workspaceIds }, status: { in: ['ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } }, select: { workspaceId: true, status: true, currentPeriodEnd: true, plan: { select: { name: true, tier: true } } } }),
      this.db.aiUsage.aggregate({ where: { workspaceId: { in: workspaceIds } }, _sum: { costMicros: true, credits: true }, _count: { id: true } }),
      this.db.auditEvent.findMany({ where: { OR: [{ actorId: id }, { entityType: 'user', entityId: id }] }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, createdAt: true, actorId: true, workspaceId: true } })
    ]);
    return { ...user, subscriptions, workspaceUsage: { requests: usage._count.id, credits: usage._sum.credits ?? 0n, costMicros: usage._sum.costMicros ?? 0n }, audit };
  }

  async setAccountStatus(actorId: string, id: string, dto: AccountStatusDto) {
    if (actorId === id) throw new ForbiddenException('Cannot change your own account status');
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } }); if (!user) throw new NotFoundException();
      if (user.systemRole === 'SUPER_ADMIN') throw new ForbiddenException('System administrators cannot be suspended here');
      if (dto.action === 'suspend' && user.disabledAt || dto.action === 'restore' && !user.disabledAt) throw new ConflictException('Account is already in that state');
      const updated = await tx.user.update({ where: { id }, data: { disabledAt: dto.action === 'suspend' ? new Date() : null }, select: { id: true, disabledAt: true } });
      if (dto.action === 'suspend') await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), accessTokenHash: null } });
      await this.audit.record(tx, { actorId, action: dto.action === 'suspend' ? 'admin.user_suspended' : 'admin.user_restored', entityType: 'user', entityId: id, metadata: { reason: dto.reason } });
      return updated;
    });
  }
}
