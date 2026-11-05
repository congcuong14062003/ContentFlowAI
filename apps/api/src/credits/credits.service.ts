import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { CreditWalletService } from './credit-wallet.service';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
import type { AdjustmentDto, GrantDto } from './credits.dto';
import { units } from './money';
@Injectable()
export class CreditsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(CreditWalletService) private readonly wallet: CreditWalletService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService) {}
  balance(workspaceId: string, userId: string) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId, true);
      const account = await this.wallet.expire(tx, workspaceId);
      const next = await tx.creditGrant.findFirst({ where: { workspaceId, expiresAt: { not: null }, remaining: { gt: 0 } }, orderBy: { expiresAt: 'asc' }, select: { expiresAt: true } });
      return { balance: account.balance, reserved: account.reserved, available: account.balance - account.reserved, nextExpiry: next?.expiresAt ?? null, unit: 'CREDIT_ATOM' };
    });
  }
  async ledger(workspaceId: string, userId: string, query: PageQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId);
      const scope = `credit-ledger:${workspaceId}`;
      return cursorPage(await tx.creditLedgerEntry.findMany({ where: { workspaceId, ...pageRange(query, scope, true) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 }), query, scope);
    });
  }
  async grants(workspaceId: string, userId: string, query: PageQuery) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx, workspaceId, userId, true); await this.wallet.expire(tx, workspaceId);
      const scope = `credit-grants:${workspaceId}`;
      return cursorPage(await tx.creditGrant.findMany({ where: { workspaceId, ...pageRange(query, scope, true) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, select: { id: true, source: true, amount: true, remaining: true, reserved: true, expiresAt: true, reference: true, createdAt: true } }), query, scope);
    });
  }
  async adminGrant(workspaceId: string, actorId: string, dto: GrantDto) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId); await this.workspaces.lockForAdministration(tx, workspaceId);
      await this.wallet.lock(tx, workspaceId);
      const replayed = !!await tx.creditGrant.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: dto.idempotencyKey } } });
      const result = await this.wallet.grant(tx, workspaceId, dto);
      await this.audit.record(tx, { actorId, workspaceId, action: 'credits.granted', entityType: 'credit_grant', entityId: result.id, metadata: { replayed, reason: dto.reason, source: dto.source, amount: dto.amount, reference: dto.reference } }); return result;
    });
  }
  async adjust(workspaceId: string, actorId: string, dto: AdjustmentDto) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId); await this.workspaces.lockForAdministration(tx, workspaceId);
      const negative = dto.amount.startsWith('-'); const amount = units(negative ? dto.amount.slice(1) : dto.amount);
      // One operation key shared by both signs; a retry cannot flip debit into a grant.
      const lock = await this.wallet.lock(tx, workspaceId);
      const priorGrant = await tx.creditGrant.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: `adjust-${dto.idempotencyKey}` } } });
      const priorDebit = await tx.creditLedgerEntry.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: `adjust:${dto.idempotencyKey}` } } });
      if ((negative && priorGrant) || (!negative && priorDebit)) throw new ConflictException('Adjustment idempotency conflict');
      const result = negative ? await this.wallet.debitAdjustment(tx, workspaceId, amount, dto.idempotencyKey, dto.reason) : await this.wallet.grant(tx, workspaceId, { source: 'ADMIN', amount: amount.toString(), idempotencyKey: `adjust-${dto.idempotencyKey}`, reference: dto.reason.slice(0, 200) });
      await this.audit.record(tx, { actorId, workspaceId, action: 'credits.adjusted', entityType: 'credit_account', entityId: lock.id, metadata: { replayed: !!(priorGrant || priorDebit), amount: dto.amount, reason: dto.reason, key: dto.idempotencyKey } }); return result;
    });
  }
  async refund(workspaceId: string, actorId: string, generationId: string, evidence: string) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId); await this.workspaces.lockForAdministration(tx, workspaceId);
      await this.wallet.lock(tx, workspaceId);
      const prior = await tx.creditReservation.findUnique({ where: { workspaceId_generationId: { workspaceId, generationId } } });
      const result = await this.wallet.refund(tx, workspaceId, generationId);
      await this.audit.record(tx, { actorId, workspaceId, action: 'credits.refunded', entityType: 'generation', entityId: generationId, metadata: { replayed: !!prior?.refundedAt, evidence } }); return result;
    });
  }
  async reconcile(workspaceId: string, actorId: string) {
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx, actorId); await this.workspaces.lockForAdministration(tx, workspaceId);
      const account = await this.wallet.expire(tx, workspaceId);
      const journal = await tx.creditLedgerEntry.aggregate({ where: { workspaceId }, _sum: { amount: true, reservedDelta: true } });
      const lots = await tx.creditGrant.aggregate({ where: { workspaceId }, _sum: { remaining: true, reserved: true } });
      const held = await tx.creditReservation.aggregate({ where: { workspaceId, status: 'HELD' }, _sum: { amount: true } });
      const consistent = account.balance === (journal._sum.amount ?? 0n) && account.reserved === (journal._sum.reservedDelta ?? 0n) && account.balance === (lots._sum.remaining ?? 0n) && account.reserved === (lots._sum.reserved ?? 0n) && account.reserved === (held._sum.amount ?? 0n);
      await this.audit.record(tx, { actorId, workspaceId, action: 'credits.reconciled', entityType: 'credit_account', entityId: account.id, metadata: { consistent } });
      return { consistent, balance: account.balance, reserved: account.reserved, journal: journal._sum, grants: lots._sum, held: held._sum.amount ?? 0n };
    });
  }
}
