import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreditAccount, CreditGrant, LedgerKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { financeError, fingerprint, MAX_UNITS, sameOperation, units } from './money';
import type { GrantDto } from './credits.dto';
type Tx = Prisma.TransactionClient;
/** Financial primitives. Call with a transaction; every operation acquires the wallet lock. */
@Injectable()
export class CreditWalletService {
  async lock(tx: Tx, workspaceId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}::text || ':credit-wallet', 0))`;
    await tx.creditAccount.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
    await tx.$queryRaw`SELECT id FROM "CreditAccount" WHERE "workspaceId" = ${workspaceId}::uuid FOR UPDATE`;
    return tx.creditAccount.findUniqueOrThrow({ where: { workspaceId } });
  }
  private async now(tx: Tx) { return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0]!.now; }
  private journal(tx: Tx, account: CreditAccount, kind: LedgerKind, amount: bigint, reservedDelta: bigint, key: string, reference?: string) {
    return tx.creditLedgerEntry.create({ data: { workspaceId: account.workspaceId, accountId: account.id, kind, amount, reservedDelta, idempotencyKey: key, reference } });
  }
  async expire(tx: Tx, workspaceId: string) {
    const account = await this.lock(tx, workspaceId); const now = await this.now(tx);
    const grants = await tx.creditGrant.findMany({ where: { workspaceId, expiresAt: { lte: now }, remaining: { gt: 0 } } });
    let expired = 0n;
    for (const grant of grants) {
      const free = grant.remaining - grant.reserved; if (free === 0n) continue;
      await tx.creditGrant.update({ where: { id: grant.id }, data: { remaining: { decrement: free } } });
      await this.journal(tx, account, 'EXPIRY', -free, 0n, `expiry:${randomUUID()}`, grant.id); expired += free;
    }
    if (expired) await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { decrement: expired }, version: { increment: 1 } } });
    return tx.creditAccount.findUniqueOrThrow({ where: { workspaceId } });
  }
  async grant(tx: Tx, workspaceId: string, dto: Omit<GrantDto, 'reason'>) {
    const amount = units(dto.amount); const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const hash = fingerprint([dto.source, dto.amount, expiresAt?.toISOString() ?? null, dto.reference]);
    const account = await this.lock(tx, workspaceId);
    const existing = await tx.creditGrant.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: dto.idempotencyKey } } });
    if (existing) { sameOperation(hash, existing.fingerprint); return existing; }
    if (['SUBSCRIPTION', 'PURCHASE', 'PROMOTIONAL'].includes(dto.source) && await tx.creditGrant.findFirst({ where: { workspaceId, source: dto.source, reference: dto.reference } })) throw new ConflictException('Funding event already granted under another idempotency key');
    if (['SUBSCRIPTION', 'PROMOTIONAL'].includes(dto.source) && !expiresAt) throw new BadRequestException('Subscription/promotional grants require an expiry');
    if (expiresAt && expiresAt <= await this.now(tx)) throw new BadRequestException('Grant expiry must be in the future');
    if (account.balance + amount > MAX_UNITS) throw new ConflictException('Wallet maximum exceeded');
    const grant = await tx.creditGrant.create({ data: { workspaceId, accountId: account.id, source: dto.source, amount, remaining: amount, expiresAt, idempotencyKey: dto.idempotencyKey, fingerprint: hash, reference: dto.reference } });
    await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: amount }, version: { increment: 1 } } });
    await this.journal(tx, account, dto.source === 'ADMIN' ? 'ADJUSTMENT' : dto.source === 'PURCHASE' ? 'PURCHASE' : 'GRANT', amount, 0n, `grant:${dto.idempotencyKey}`, grant.id);
    return grant;
  }
  private available(tx: Tx, workspaceId: string) {
    return tx.creditGrant.findMany({ where: { workspaceId, remaining: { gt: 0 } }, orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }] });
  }
  async reserve(tx: Tx, workspaceId: string, generationId: string, amount: bigint) {
    if (amount <= 0n || amount > MAX_UNITS) throw new BadRequestException('Invalid reservation amount');
    const account = await this.expire(tx, workspaceId);
    const previous = await tx.creditReservation.findUnique({ where: { workspaceId_generationId: { workspaceId, generationId } } });
    if (previous) { if (previous.amount !== amount) throw new ConflictException('Reservation amount mismatch'); return previous; }
    if (account.balance - account.reserved < amount) financeError('INSUFFICIENT_CREDITS', 402);
    const reservation = await tx.creditReservation.create({ data: { workspaceId, accountId: account.id, generationId, amount, expiresAt: new Date((await this.now(tx)).getTime() + 300000) } });
    let pending = amount;
    for (const grant of await this.available(tx, workspaceId)) {
      const free = grant.remaining - grant.reserved; const take = free < pending ? free : pending; if (!take) continue;
      await tx.creditGrant.update({ where: { id: grant.id }, data: { reserved: { increment: take } } });
      await tx.creditAllocation.create({ data: { workspaceId, reservationId: reservation.id, grantId: grant.id, amount: take } });
      pending -= take; if (!pending) break;
    }
    if (pending) throw new ConflictException('Wallet allocation mismatch');
    await tx.creditAccount.update({ where: { id: account.id }, data: { reserved: { increment: amount }, version: { increment: 1 } } });
    await this.journal(tx, account, 'RESERVE', 0n, amount, `reserve:${reservation.id}`, generationId);
    return reservation;
  }
  async settle(tx: Tx, workspaceId: string, generationId: string, actual: bigint) {
    const account = await this.lock(tx, workspaceId);
    const reservation = await tx.creditReservation.findUnique({ where: { workspaceId_generationId: { workspaceId, generationId } }, include: { allocations: { include: { grant: true } } } });
    if (!reservation) throw new NotFoundException();
    if (reservation.status === 'SETTLED') { if (reservation.settledAmount !== actual) throw new ConflictException('Settlement mismatch'); return reservation; }
    if (reservation.status !== 'HELD' || actual < 0n || actual > reservation.amount) throw new ConflictException('Invalid settlement');
    // Allocate actual usage in the same expiry order as the original reservation.
    const allocations = reservation.allocations.sort((a, b) => this.compareGrants(a.grant, b.grant)); let pending = actual;
    for (const allocation of allocations) {
      const consumed = allocation.amount < pending ? allocation.amount : pending;
      await tx.creditGrant.update({ where: { id: allocation.grantId }, data: { remaining: { decrement: consumed }, reserved: { decrement: allocation.amount } } });
      await tx.creditAllocation.update({ where: { workspaceId_reservationId_grantId: { workspaceId, reservationId: reservation.id, grantId: allocation.grantId } }, data: { consumed } }); pending -= consumed;
    }
    await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { decrement: actual }, reserved: { decrement: reservation.amount }, version: { increment: 1 } } });
    await this.journal(tx, account, actual ? 'USAGE' : 'RELEASE', -actual, -reservation.amount, `settle:${reservation.id}`, generationId);
    const settled = await tx.creditReservation.update({ where: { id: reservation.id }, data: { status: 'SETTLED', settledAmount: actual } });
    await this.expire(tx, workspaceId); return settled;
  }
  private compareGrants(a: CreditGrant, b: CreditGrant) { return (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id); }
  async release(tx: Tx, workspaceId: string, generationId: string) {
    const account = await this.lock(tx, workspaceId);
    const reservation = await tx.creditReservation.findUnique({ where: { workspaceId_generationId: { workspaceId, generationId } }, include: { allocations: true } });
    if (!reservation) throw new NotFoundException();
    if (reservation.status === 'RELEASED') return reservation;
    if (reservation.status !== 'HELD') throw new ConflictException('Settled funds cannot be released');
    for (const allocation of reservation.allocations) await tx.creditGrant.update({ where: { id: allocation.grantId }, data: { reserved: { decrement: allocation.amount } } });
    await tx.creditAccount.update({ where: { id: account.id }, data: { reserved: { decrement: reservation.amount }, version: { increment: 1 } } });
    await this.journal(tx, account, 'RELEASE', 0n, -reservation.amount, `release:${reservation.id}`, generationId);
    const released = await tx.creditReservation.update({ where: { id: reservation.id }, data: { status: 'RELEASED' } });
    await this.expire(tx, workspaceId); return released;
  }
  async refund(tx: Tx, workspaceId: string, generationId: string) {
    const account = await this.lock(tx, workspaceId);
    const reservation = await tx.creditReservation.findUnique({ where: { workspaceId_generationId: { workspaceId, generationId } }, include: { allocations: true } });
    if (!reservation || reservation.status !== 'SETTLED') throw new ConflictException('Only settled reservations can be refunded');
    if (reservation.refundedAt) return reservation;
    for (const allocation of reservation.allocations) if (allocation.consumed) await tx.creditGrant.update({ where: { id: allocation.grantId }, data: { remaining: { increment: allocation.consumed } } });
    if (reservation.settledAmount) {
      await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { increment: reservation.settledAmount }, version: { increment: 1 } } });
      await this.journal(tx, account, 'REFUND', reservation.settledAmount, 0n, `refund:${reservation.id}`, generationId);
    }
    const result = await tx.creditReservation.update({ where: { id: reservation.id }, data: { refundedAt: await this.now(tx) } });
    await this.expire(tx, workspaceId); return result;
  }
  async debitAdjustment(tx: Tx, workspaceId: string, amount: bigint, key: string, reason: string) {
    const account = await this.expire(tx, workspaceId);
    const existing = await tx.creditLedgerEntry.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: `adjust:${key}` } } });
    const hash = fingerprint([amount.toString(), reason]);
    if (existing) { sameOperation(hash, existing.reference); return existing; }
    if (amount <= 0n || amount > account.balance - account.reserved) financeError('INSUFFICIENT_CREDITS', 402);
    let pending = amount;
    for (const grant of await this.available(tx, workspaceId)) {
      const free = grant.remaining - grant.reserved; const take = free < pending ? free : pending; if (!take) continue;
      await tx.creditGrant.update({ where: { id: grant.id }, data: { remaining: { decrement: take } } }); pending -= take; if (!pending) break;
    }
    if (pending) throw new ConflictException('Wallet allocation mismatch');
    await tx.creditAccount.update({ where: { id: account.id }, data: { balance: { decrement: amount }, version: { increment: 1 } } });
    return this.journal(tx, account, 'ADJUSTMENT', -amount, 0n, `adjust:${key}`, hash);
  }
}
