import { describe, expect, it, vi } from 'vitest';
import { SupportService } from './support.service';
import type { PrismaService } from '../platform/prisma.service';
import type { WorkspaceService } from '../workspaces/workspace.service';
import type { IdentityService } from '../identity/identity.service';
import type { AuditService } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';

describe('ticket access and notifications',()=>{
  function fixture(requesterId='owner'){
    const ticket={id:'ticket',workspaceId:'workspace-a',requesterId,status:'OPEN'};
    const db={ $transaction:vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>fn(db)),supportTicket:{findUnique:vi.fn(async()=>ticket),findMany:vi.fn(async()=>[]),update:vi.fn(async()=>ticket)},supportMessage:{create:vi.fn(async()=>({id:'message',internal:false}))},supportNotification:{create:vi.fn(async()=>({id:'notice'})),updateMany:vi.fn(async()=>({count:0}))},auditEvent:{findMany:vi.fn(async()=>[])},user:{findFirst:vi.fn(async()=>null)} };
    const workspace={authorize:vi.fn(async (_tx:unknown,w:string)=>{if(w!=='workspace-a')throw Error('denied');})};
    const identity={requireSystemAdmin:vi.fn(async()=>undefined)};
    const audit={record:vi.fn(async()=>undefined)};
    const notifications={create:vi.fn(async()=>({id:'new-notice',userId:'owner'})),announce:vi.fn(async()=>undefined)};
    return {service:new SupportService(db as unknown as PrismaService,workspace as unknown as WorkspaceService,identity as unknown as IdentityService,audit as unknown as AuditService,notifications as unknown as NotificationService),db,workspace,notifications};
  }
  it('hides another requester ticket and a different workspace',async()=>{
    const {service}=fixture();
    await expect(service.detail('workspace-a','ticket','other',false)).rejects.toThrow();
    await expect(service.detail('workspace-b','ticket','owner',false)).rejects.toThrow();
    await expect(service.reply('workspace-a','ticket','other',false,{body:'hello'})).rejects.toThrow();
  });
  it('blocks customer internal notes and emits one notification on an admin reply',async()=>{
    const {service,db}=fixture();
    await expect(service.reply('workspace-a','ticket','owner',false,{body:'private',internal:true})).rejects.toThrow();
    await service.reply('workspace-a','ticket','admin',true,{body:'answer'});
    expect(db.supportNotification.create).toHaveBeenCalledTimes(1);
    await service.reply('workspace-a','ticket','admin',true,{body:'internal',internal:true});
    expect(db.supportNotification.create).toHaveBeenCalledTimes(1);
  });
  it('cannot mark a notification owned by another user as read',async()=>{
    const {service}=fixture();
    await expect(service.markRead('other','notice')).rejects.toThrow();
  });
});
