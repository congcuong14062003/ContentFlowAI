import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { financeError, units } from '../credits/money';
import type { PolicyDto } from '../credits/credits.dto';
type Tx = Prisma.TransactionClient;
export const policyKey = (workspaceId?: string) => workspaceId ? `workspace:${workspaceId}` : 'global';
@Injectable()
export class AiPolicyService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService) {}
  async globalLock(tx: Tx) {
    // Serializes dispatch admission, cap changes and emergency kill switch across API processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(70051001)`;
    return tx.aiPolicy.upsert({ where: { key: 'global' }, create: { key: 'global' }, update: {} });
  }
  async admission(tx: Tx, workspaceId: string, micros: bigint) {
    const global = await this.globalLock(tx);
    const workspace = await tx.aiPolicy.findUnique({ where: { key: policyKey(workspaceId) } });
    if (!global.enabled || !workspace?.enabled) financeError('AI_DISABLED', 409);
    const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0]!.now;
    const day = new Date(`${now.toISOString().slice(0,10)}T00:00:00.000Z`);
    const active = await tx.aiGeneration.count({ where: { workspaceId, status: { in: ['QUEUED', 'RUNNING', 'UNKNOWN'] } } });
    if (active >= workspace.maxConcurrent) financeError('AI_CONCURRENCY_LIMIT', 429);
    const window = await tx.aiRateWindow.findUnique({ where: { workspaceId } });
    const fresh = !window || now.getTime() - window.startedAt.getTime() >= 60000;
    if (!fresh && window.count >= workspace.requestsPerMinute) financeError('AI_RATE_LIMIT', 429);
    for (const policy of [global, workspace]) {
      const bucket = await tx.aiSpendBucket.upsert({ where: { scope_day: { scope: policy.key, day } }, create: { scope: policy.key, day }, update: {} });
      if (bucket.spentMicros + bucket.reservedMicros + micros > policy.dailyCapMicros) financeError('AI_SPEND_CAP', 409);
      await tx.aiSpendBucket.update({ where: { scope_day: { scope: policy.key, day } }, data: { reservedMicros: { increment: micros } } });
    }
    await tx.aiRateWindow.upsert({ where: { workspaceId }, create: { workspaceId, startedAt: now, count: 1 }, update: fresh ? { startedAt: now, count: 1 } : { count: { increment: 1 } } });
    return day;
  }
  async finish(tx: Tx, workspaceId: string, day: Date, reserved: bigint, actual: bigint) {
    if (actual < 0n || actual > reserved) throw new ConflictException('Spend reconciliation exceeds reservation');
    for (const scope of ['global', policyKey(workspaceId)]) {
      const result = await tx.aiSpendBucket.updateMany({ where: { scope, day, reservedMicros: { gte: reserved } }, data: { reservedMicros: { decrement: reserved }, spentMicros: { increment: actual } } });
      if (result.count !== 1) throw new ConflictException('Spend bucket invariant violated');
    }
  }
  async configure(actorId: string, dto: PolicyDto, workspaceId?: string) {
    return this.db.$transaction(async tx => {
      await this.globalLock(tx); await this.identity.requireSystemAdmin(tx, actorId);
      if (workspaceId) await this.workspaces.lockForAdministration(tx, workspaceId);
      const data = { enabled: dto.enabled, dailyCapMicros: units(dto.dailyCapMicros, true), requestsPerMinute: dto.requestsPerMinute, maxConcurrent: dto.maxConcurrent };
      const result = await tx.aiPolicy.upsert({ where: { key: policyKey(workspaceId) }, create: { key: policyKey(workspaceId), workspaceId, ...data }, update: data });
      await this.audit.record(tx, { actorId, workspaceId, action: 'ai.policy_changed', entityType: 'ai_policy', entityId: result.key, metadata: { ...dto } }); return result;
    });
  }
  async current(actorId: string, workspaceId?: string) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId);
      return tx.aiPolicy.findUnique({ where: { key: policyKey(workspaceId) }, select: { key: true, enabled: true, dailyCapMicros: true, requestsPerMinute: true, maxConcurrent: true } });
    });
  }
}
