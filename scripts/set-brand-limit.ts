import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const workspaceId = process.env.ENTITLEMENT_WORKSPACE_ID;
  const actorId = process.env.ENTITLEMENT_ACTOR_ID;
  const value = process.env.ENTITLEMENT_BRAND_LIMIT ?? '';
  if (!workspaceId || !actorId || !/^\d{1,4}$/.test(value) || Number(value) > 1000) throw new Error('Explicit workspace, verified system admin actor and brand limit (0–1000) required');
  await db.$transaction(async tx => {
    const actor = await tx.user.findFirst({ where: { id: actorId, systemRole: 'SUPER_ADMIN', emailVerifiedAt: { not: null }, disabledAt: null } });
    if (!actor) throw new Error('Verified active super administrator required');
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    if (!await tx.workspace.findFirst({ where: { id: workspaceId, archivedAt: null } })) throw new Error('Workspace unavailable');
    await tx.workspaceEntitlement.upsert({ where: { workspaceId }, create: { workspaceId, brandLimit: Number(value) }, update: { brandLimit: Number(value) } });
    await tx.auditEvent.create({ data: { actorId, workspaceId, action: 'catalog.entitlement_changed', entityType: 'workspace', entityId: workspaceId, requestId: 'operator-entitlement' } });
  });
  console.log('Brand entitlement saved. Existing brands are retained.');
}
void main().catch(() => { console.error('Entitlement provisioning failed. Check identity, workspace and configuration.'); process.exitCode = 1; }).finally(() => db.$disconnect());
