import type { PrismaClient } from '@prisma/client';
import { startMailDispatcher } from '@contentflow/mail';
export function startOutbox(db: PrismaClient, env: Record<string, string | undefined>) {
  return startMailDispatcher({
    pending: () => db.outboxEvent.findMany({ where: { topic: 'identity.email', publishedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, payload: true } }),
    published: (id) => db.outboxEvent.updateMany({ where: { id, publishedAt: null }, data: { publishedAt: new Date() } })
  }, env);
}
