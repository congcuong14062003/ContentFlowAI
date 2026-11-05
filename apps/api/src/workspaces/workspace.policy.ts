import { ForbiddenException } from '@nestjs/common';
import type { WorkspaceRole } from '@prisma/client';
export function requireManager(role: WorkspaceRole) { if (role !== 'OWNER' && role !== 'ADMIN') throw new ForbiddenException(); }
export function canGrant(actor: WorkspaceRole, grant: WorkspaceRole, target?: WorkspaceRole) {
  requireManager(actor);
  if (grant === 'OWNER' || target === 'OWNER' || (actor === 'ADMIN' && (grant === 'ADMIN' || target === 'ADMIN'))) throw new ForbiddenException('Role change is not allowed');
}
