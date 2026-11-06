import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateTicketDto, ReplyDto, TicketQuery, UpdateTicketDto } from './support.dto';

@Injectable()
export class SupportService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService,@Inject(NotificationService) private readonly notifier:NotificationService) {}
  private async access(workspaceId: string, userId: string, admin: boolean) {
    if (admin) await this.db.$transaction(tx => this.identity.requireSystemAdmin(tx,userId));
    else await this.db.$transaction(tx => this.workspaces.authorize(tx,workspaceId,userId));
  }
  async list(workspaceId: string | null, userId: string, admin: boolean, query: TicketQuery) {
    if (workspaceId) await this.access(workspaceId,userId,admin); else await this.access('',userId,true);
    const where: Prisma.SupportTicketWhereInput = { ...(workspaceId ? { workspaceId } : query.workspaceId ? { workspaceId:query.workspaceId } : {}), ...(!admin ? { requesterId:userId } : {}), ...(query.status ? { status:query.status } : {}), ...(query.priority ? { priority:query.priority } : {}), ...(admin && query.assigneeId ? { assigneeId:query.assigneeId } : {}), ...(query.search ? { OR: [{subject:{contains:query.search,mode:'insensitive'}},{messages:{some:{body:{contains:query.search,mode:'insensitive'},internal: false}}}] } : {}) };
    return this.db.supportTicket.findMany({ where, orderBy:[{updatedAt:'desc'},{id:'desc'}],take:100,select:{id:true,workspaceId:true,subject:true,kind:true,status:true,priority:true,requesterId:true,assigneeId:true,createdAt:true,updatedAt:true} });
  }
  async create(workspaceId: string, userId: string, dto: CreateTicketDto) {
    return this.db.$transaction(async tx => {
      await this.workspaces.authorize(tx,workspaceId,userId);
      const ticket=await tx.supportTicket.create({data:{workspaceId,requesterId:userId,subject:dto.subject.trim(),kind:dto.kind,messages:{create:{authorId:userId,body:dto.body.trim()}}}});
      await this.audit.record(tx,{workspaceId,actorId:userId,action:'support.ticket_created',entityType:'support_ticket',entityId:ticket.id});
      return ticket;
    });
  }
  async detail(workspaceId: string, id: string, userId: string, admin: boolean) {
    await this.access(workspaceId,userId,admin);
    const ticket=await this.db.supportTicket.findUnique({where:{workspaceId_id:{workspaceId,id}},select:{id:true,workspaceId:true,requesterId:true,assigneeId:true,subject:true,kind:true,status:true,priority:true,createdAt:true,updatedAt:true,messages:{where:admin?{}:{internal:false},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,authorId:true,body:true,internal:true,createdAt:true}}}});
    if (!ticket || !admin && ticket.requesterId !== userId) throw new NotFoundException();
    const history=await this.db.auditEvent.findMany({where:{workspaceId,entityType:'support_ticket',entityId:id,...(!admin?{action:{not:'support.internal_note'}}:{})},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,action:true,actorId:true,createdAt:true,metadata:true}});
    return {...ticket,history};
  }
  async reply(workspaceId: string, id: string, userId: string, admin: boolean, dto: ReplyDto) {
    if (!admin && dto.internal) throw new ForbiddenException();
    if (!dto.body.trim()) throw new BadRequestException('Empty reply');
    const result=await this.db.$transaction(async tx => {
      if (admin) await this.identity.requireSystemAdmin(tx,userId); else await this.workspaces.authorize(tx,workspaceId,userId);
      const ticket=await tx.supportTicket.findUnique({where:{workspaceId_id:{workspaceId,id}}}); if (!ticket || !admin && ticket.requesterId !== userId) throw new NotFoundException();
      const message=await tx.supportMessage.create({data:{workspaceId,ticketId:id,authorId:userId,body:dto.body.trim(),internal:admin && !!dto.internal}});
      await tx.supportTicket.update({where:{id},data:{status:admin && !dto.internal?'WAITING_CUSTOMER':!admin?'OPEN':ticket.status}});
      let notice=null;
      if (admin && !dto.internal && ticket.requesterId !== userId) {
        await tx.supportNotification.create({data:{userId:ticket.requesterId,workspaceId,ticketId:id,messageId:message.id}});
        notice=await this.notifier.create(tx,{userId:ticket.requesterId,workspaceId,eventType:'SUPPORT_REPLY',dedupeKey:`support:${message.id}`,title:'Support reply',body:ticket.subject,url:`/w/${workspaceId}/support`});
      }
      await this.audit.record(tx,{workspaceId,actorId:userId,action:message.internal?'support.internal_note':'support.reply',entityType:'support_ticket',entityId:id});
      return {message,notice};
    });
    if(result.notice)await this.notifier.announce([result.notice]);return result.message;
  }
  async update(workspaceId: string, id: string, userId: string, dto: UpdateTicketDto) {
    if (!dto.status && !dto.priority && !dto.assigneeId) throw new BadRequestException('No change');
    return this.db.$transaction(async tx => {
      await this.identity.requireSystemAdmin(tx,userId);
      const ticket=await tx.supportTicket.findUnique({where:{workspaceId_id:{workspaceId,id}}}); if (!ticket) throw new NotFoundException();
      if (dto.assigneeId && !await tx.user.findFirst({where:{id:dto.assigneeId,systemRole:'SUPER_ADMIN',disabledAt:null}})) throw new BadRequestException('Assignee must be an active administrator');
      const updated=await tx.supportTicket.update({where:{id},data:{status:dto.status,priority:dto.priority,assigneeId:dto.assigneeId}});
      await this.audit.record(tx,{workspaceId,actorId:userId,action:'support.ticket_updated',entityType:'support_ticket',entityId:id,metadata:{status:dto.status??null,priority:dto.priority??null,assigneeId:dto.assigneeId??null}});
      return updated;
    });
  }
  async notifications(userId: string) { return this.db.supportNotification.findMany({where:{userId,readAt:null},orderBy:{createdAt:'desc'},take:100,select:{id:true,workspaceId:true,ticketId:true,createdAt:true}}); }
  async markRead(userId: string, id: string) { const result=await this.db.supportNotification.updateMany({where:{id,userId,readAt:null},data:{readAt:new Date()}}); if (!result.count) throw new NotFoundException(); return {read:true}; }
}
