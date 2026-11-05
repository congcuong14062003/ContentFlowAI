import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || process.env.BOOTSTRAP_ADMIN_CONFIRM !== 'PROMOTE_VERIFIED_USER') throw new Error('Explicit verified identity and confirmation environment variables required');
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19023711)`;
    if (await tx.user.count({ where: { systemRole: 'SUPER_ADMIN' } })) throw new Error('A super administrator already exists; bootstrap refused');
    const user = await tx.user.findUnique({ where: { email } });
    if (!user?.emailVerifiedAt || user.disabledAt) throw new Error('Register and verify the account before bootstrap');
    await tx.user.update({ where: { id: user.id }, data: { systemRole: 'SUPER_ADMIN' } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: 'system.admin_bootstrapped', entityType: 'user', entityId: user.id, requestId: 'admin-bootstrap' } });
  });
  console.log('Verified account promoted. No password was created or changed.');
}
void main().catch((error: unknown) => { console.error(error instanceof Error && !error.message.includes('prisma') ? error.message : 'Bootstrap failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
