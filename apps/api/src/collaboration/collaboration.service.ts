import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
import { ActivityQuery, AssignmentDto, CommentDto } from './collaboration.dto';
type Tx=Prisma.TransactionClient;
@Injectable()
export class CollaborationService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(WorkspaceService) private readonly workspaces:WorkspaceService,@Inject(IdentityService) private readonly identity:IdentityService,@Inject(AuditService) private readonly audit:AuditService,@Inject(NotificationService) private readonly notifications:NotificationService){}
  private async role(tx:Tx,w:string,userId:string){const role=await this.workspaces.authorize(tx,w,userId);await this.identity.requireActiveVerifiedUser(tx,userId);return role;}
  private async member(tx:Tx,w:string,userId:string){const row=await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId:w,userId}},select:{user:{select:{disabledAt:true,emailVerifiedAt:true}},role:true}});if(!row||row.user.disabledAt||!row.user.emailVerifiedAt)throw new BadRequestException('Target must be an active verified workspace member');return row;}
  async assign(w:string,id:string,actorId:string,dto:AssignmentDto){
    const result=await this.db.$transaction(async tx=>{
      const role=await this.role(tx,w,actorId);if(!['OWNER','ADMIN'].includes(role))throw new ForbiddenException();
      const content=await tx.content.findUnique({where:{workspaceId_id:{workspaceId:w,id}}});if(!content)throw new NotFoundException();
      if(content.version!==dto.expectedVersion)throw new ConflictException('Content version conflict');
      await this.member(tx,w,dto.assigneeId);if(dto.ownerId)await this.member(tx,w,dto.ownerId);
      const changed=await tx.content.updateMany({where:{workspaceId:w,id,version:dto.expectedVersion},data:{assigneeId:dto.assigneeId,...(dto.ownerId?{ownerId:dto.ownerId}:{}),version:{increment:1}}});if(!changed.count)throw new ConflictException('Content version conflict');
      await this.audit.record(tx,{workspaceId:w,actorId,action:'content.assigned',entityType:'content',entityId:id,metadata:{assigneeId:dto.assigneeId,ownerId:dto.ownerId??content.ownerId,version:dto.expectedVersion+1}});
      const notice=dto.assigneeId!==actorId?await this.notifications.create(tx,{userId:dto.assigneeId,workspaceId:w,eventType:'CONTENT_ASSIGNED',dedupeKey:`assignment:${id}:${dto.expectedVersion+1}`,title:'Content assigned',body:content.title,url:`/w/${w}/content/${id}`}):null;
      return {content:await tx.content.findUniqueOrThrow({where:{id},select:{id:true,ownerId:true,assigneeId:true,reviewerId:true,status:true,version:true}}),notice};
    });if(result.notice)await this.notifications.announce([result.notice]);return result.content;
  }
  async comments(w:string,id:string,userId:string,q:PageQuery){return this.db.$transaction(async tx=>{await this.role(tx,w,userId);if(!await tx.content.findUnique({where:{workspaceId_id:{workspaceId:w,id}},select:{id:true}}))throw new NotFoundException();const scope=`comments:${w}:${id}`;const rows=await tx.contentComment.findMany({where:{workspaceId:w,contentId:id,...pageRange(q,scope)},orderBy:[{createdAt:'asc'},{id:'asc'}],take:q.limit+1,select:{id:true,authorId:true,body:true,mentions:true,createdAt:true}});return cursorPage(rows,q,scope);});}
  async comment(w:string,id:string,userId:string,dto:CommentDto){
    const body=dto.body.trim();if(!body)throw new BadRequestException('Empty comment');
    const result=await this.db.$transaction(async tx=>{
      const role=await this.role(tx,w,userId);if(role==='VIEWER')throw new ForbiddenException();
      const content=await tx.content.findUnique({where:{workspaceId_id:{workspaceId:w,id}},select:{title:true}});if(!content)throw new NotFoundException();
      for(const mentioned of dto.mentions)await this.member(tx,w,mentioned);
      const row=await tx.contentComment.create({data:{workspaceId:w,contentId:id,authorId:userId,body,mentions:dto.mentions}});
      await this.audit.record(tx,{workspaceId:w,actorId:userId,action:'content.commented',entityType:'content',entityId:id,metadata:{commentId:row.id}});
      const notices=[];for(const target of dto.mentions.filter(value=>value!==userId)){const notice=await this.notifications.create(tx,{userId:target,workspaceId:w,eventType:'COMMENT_MENTION',dedupeKey:`mention:${row.id}:${target}`,title:'Comment mention',body:content.title,url:`/w/${w}/content/${id}`});if(notice)notices.push(notice);}
      return {row,notices};
    });if(result.notices.length)await this.notifications.announce(result.notices);return result.row;
  }
  async timeline(w:string,id:string,userId:string,q:PageQuery){return this.db.$transaction(async tx=>{await this.role(tx,w,userId);if(!await tx.content.findUnique({where:{workspaceId_id:{workspaceId:w,id}},select:{id:true}}))throw new NotFoundException();const scope=`activity:${w}:${id}`;const rows=await tx.auditEvent.findMany({where:{workspaceId:w,entityType:'content',entityId:id,...pageRange(q,scope,true)},orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.limit+1,select:{id:true,actorId:true,action:true,metadata:true,createdAt:true}});return cursorPage(rows,q,scope);});}
  async teamActivity(w:string,userId:string,q:ActivityQuery){return this.db.$transaction(async tx=>{await this.role(tx,w,userId);const scope=`team-activity:${w}:${q.action??''}`;const rows=await tx.auditEvent.findMany({where:{workspaceId:w,action:q.action?{startsWith:q.action}:undefined,...pageRange(q,scope,true)},orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.limit+1,select:{id:true,actorId:true,action:true,entityType:true,entityId:true,createdAt:true}});return cursorPage(rows,q,scope);});}
}
