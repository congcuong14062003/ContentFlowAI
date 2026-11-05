import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused:unused@localhost:1/unused' } } });
afterAll(async () => { await prisma.$disconnect(); });

describe.skipIf(!url)('real PostgreSQL foundation (requires TEST_DATABASE_URL)', () => {
  it('connects and has migrated tables', async () => {
    expect(await prisma.$queryRaw`SELECT 1 AS value`).toEqual([{ value: 1 }]);
    expect(await prisma.systemSetting.findUnique({ where: { key: 'supported_languages' } })).toMatchObject({ value: ['vi', 'en'] });
  });

  it('rejects cross-workspace references, duplicate owners, invalid balances, and immutable history changes', async () => {
    // Everything is rolled back. No truncation or destructive fixture cleanup.
    const rollback = new Error('rollback-test-fixtures');
    await expect(prisma.$transaction(async (tx) => {
      const suffix = randomUUID();
      const first = await tx.workspace.create({ data: { name: 'Integration A', slug: `a-${suffix}` } });
      const second = await tx.workspace.create({ data: { name: 'Integration B', slug: `b-${suffix}` } });
      const brand = await tx.brand.create({ data: { workspaceId: first.id, name: 'Integration' } });
      // Savepoints recover a failed statement without aborting the outer rollback transaction.
      await tx.$executeRawUnsafe('SAVEPOINT constraint_test');
      await expect(tx.content.create({ data: { workspaceId: second.id, brandId: brand.id, title: 'Cross-tenant' } })).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT constraint_test');
      const user = await tx.user.create({ data: { email: `${suffix}@example.invalid`, displayName: 'Test' } });
      const other = await tx.user.create({ data: { email: `other-${suffix}@example.invalid`, displayName: 'Test' } });
      await tx.membership.create({ data: { workspaceId: first.id, userId: user.id, role: 'OWNER' } });
      await tx.$executeRawUnsafe('SAVEPOINT owner_test');
      await expect(tx.membership.create({ data: { workspaceId: first.id, userId: other.id, role: 'OWNER' } })).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT owner_test');
      await tx.$executeRawUnsafe('SAVEPOINT balance_test');
      await expect(tx.creditAccount.create({ data: { workspaceId: first.id, balance: -1 } })).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT balance_test');
      const account = await tx.creditAccount.create({ data: { workspaceId: first.id } });
      const entry = await tx.creditLedgerEntry.create({ data: { workspaceId: first.id, accountId: account.id, kind: 'GRANT', amount: 1, idempotencyKey: suffix } });
      await tx.$executeRawUnsafe('SAVEPOINT ledger_test');
      await expect(tx.creditLedgerEntry.update({ where: { id: entry.id }, data: { amount: 2 } })).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ledger_test');
      await tx.$executeRawUnsafe('SAVEPOINT ledger_delete_test');
      await expect(tx.creditLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ledger_delete_test');
      const audit = await tx.auditEvent.create({ data: { actorId: user.id, workspaceId: first.id, action: 'test', entityType: 'workspace', requestId: suffix } });
      await tx.$executeRawUnsafe('SAVEPOINT audit_test');
      await expect(tx.auditEvent.update({ where: { id: audit.id }, data: { action: 'changed' } })).rejects.toThrow();
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT audit_test');
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
