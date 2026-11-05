import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { requestContext } from '../common/request-context';
@Injectable()
export class AuditService {
  record(tx: Pick<Prisma.TransactionClient, 'auditEvent'>, input: { actorId?: string; workspaceId?: string; action: string; entityType: string; entityId?: string; requestId?: string; metadata?: Prisma.InputJsonValue }) {
    return tx.auditEvent.create({ data: { ...input, requestId: input.requestId ?? requestContext.getStore()?.requestId ?? 'background-operation' } });
  }
}
