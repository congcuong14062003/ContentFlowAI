import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../platform/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import { NotificationService } from '../notifications/notification.service';
import { cursorPage, pageRange } from '../common/pagination';
import { AttachContentDto, CalendarQuery, CampaignDto, CampaignQuery, ScheduleDto, TransitionDto } from './campaign.dto';
type Tx = Prisma.TransactionClient;
const transitions: Record<ContentStatus, readonly ContentStatus[]> = {
  IDEA: ['DRAFT','ARCHIVED'], DRAFT: ['IN_REVIEW','ARCHIVED'], IN_REVIEW: ['APPROVED','REJECTED','ARCHIVED'],
  APPROVED: ['SCHEDULED','ARCHIVED'], REJECTED: ['DRAFT','ARCHIVED'], SCHEDULED: ['APPROVED','PUBLISHED','FAILED','ARCHIVED'],
  PUBLISHED: ['ARCHIVED'], FAILED: ['SCHEDULED','ARCHIVED'], ARCHIVED: []
};
function utc(value?: string) {
  if (!value) return null;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) throw new BadRequestException('Use an explicit UTC timestamp');
  const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid timestamp'); return date;
}
@Injectable()
export class CampaignService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Inject(IdentityService) private readonly identity: IdentityService, @Inject(AuditService) private readonly audit: AuditService, @Inject(CatalogService) private readonly catalog: CatalogService, @Inject(NotificationService) private readonly notifications: NotificationService) {}
  private async role(tx: Tx, workspaceId: string, actorId: string, level: 'read' | 'write' | 'approve' = 'read') {
    const role = await this.workspaces.authorize(tx, workspaceId, actorId, level !== 'read');
    await this.identity.requireActiveVerifiedUser(tx, actorId);
    if ((level === 'write' && role === 'VIEWER') || (level === 'approve' && !['OWNER','ADMIN'].includes(role))) throw new ForbiddenException();
  }
  async list(workspaceId: string, actorId: string, q: CampaignQuery) {
    return this.db.$transaction(async tx => {
      await this.role(tx, workspaceId, actorId);
      const scope = createHash('sha256').update(JSON.stringify([workspaceId,q.search ?? '',q.status ?? '',q.brandId ?? ''])).digest('hex');
      const rows = await tx.campaign.findMany({ where: { workspaceId, name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined, status: q.status, brandId: q.brandId, ...pageRange(q, scope, true) }, orderBy: [{ createdAt: 'desc' },{ id: 'desc' }], take: q.limit + 1, include: { _count: { select: { contents: true } } } });
      return cursorPage(rows,q,scope);
    });
  }
  async detail(workspaceId: string, actorId: string, id: string) {
    return this.db.$transaction(async tx => { await this.role(tx,workspaceId,actorId); const row = await tx.campaign.findFirst({ where: { workspaceId,id }, include: { contents: { select: { id:true,title:true,status:true,scheduledAt:true,version:true } } } }); if (!row) throw new NotFoundException(); return { ...row, progress: { total: row.contents.length, published: row.contents.filter(x=>x.status==='PUBLISHED').length } }; });
  }
  async create(workspaceId: string, actorId: string, dto: CampaignDto) {
    if (dto.brandId) await this.catalog.brandContext(workspaceId,actorId,dto.brandId);
    const startsAt=utc(dto.startsAt), endsAt=utc(dto.endsAt); if (startsAt && endsAt && startsAt>endsAt) throw new BadRequestException('Start exceeds end');
    return this.db.$transaction(async tx=> { await this.role(tx,workspaceId,actorId,'write'); const row=await tx.campaign.create({data:{workspaceId,name:dto.name.trim(),objective:dto.objective.trim(),audiences:dto.audiences,status:dto.status,brandId:dto.brandId,startsAt,endsAt}}); await this.audit.record(tx,{workspaceId,actorId,action:'campaign.created',entityType:'campaign',entityId:row.id}); return row; });
  }
  async update(workspaceId: string, actorId: string, id: string, dto: CampaignDto) {
    if (!dto.expectedVersion) throw new BadRequestException('Expected version required');
    if (dto.brandId) await this.catalog.brandContext(workspaceId,actorId,dto.brandId);
    const startsAt=utc(dto.startsAt),endsAt=utc(dto.endsAt); if (startsAt && endsAt && startsAt>endsAt) throw new BadRequestException('Start exceeds end');
    return this.db.$transaction(async tx=> { await this.role(tx,workspaceId,actorId,'write'); const existing=await tx.campaign.findFirst({where:{workspaceId,id}}); if(!existing)throw new NotFoundException(); if(existing.version!==dto.expectedVersion)throw new ConflictException('Campaign version conflict'); const changed=await tx.campaign.updateMany({where:{workspaceId,id,version:dto.expectedVersion},data:{name:dto.name.trim(),objective:dto.objective.trim(),audiences:dto.audiences,status:dto.status,brandId:dto.brandId??null,startsAt,endsAt,version:{increment:1}}}); if(!changed.count)throw new ConflictException('Campaign version conflict'); await this.audit.record(tx,{workspaceId,actorId,action:'campaign.updated',entityType:'campaign',entityId:id,metadata:{version:dto.expectedVersion+1}}); return tx.campaign.findUniqueOrThrow({where:{id}}); });
  }
  async attach(workspaceId:string, actorId:string, campaignId:string, dto:AttachContentDto) {
    return this.db.$transaction(async tx=>{ await this.role(tx,workspaceId,actorId,'write'); const campaign=await tx.campaign.findFirst({where:{workspaceId,id:campaignId,status:{not:'ARCHIVED'}}}); if(!campaign)throw new NotFoundException(); const content=await tx.content.findFirst({where:{workspaceId,id:dto.contentId}}); if(!content)throw new NotFoundException(); if(content.brandId && campaign.brandId && content.brandId!==campaign.brandId)throw new ConflictException('Brand mismatch'); const changed=await tx.content.updateMany({where:{workspaceId,id:dto.contentId,version:dto.expectedVersion},data:{campaignId,version:{increment:1}}}); if(!changed.count)throw new ConflictException('Content version conflict'); await this.audit.record(tx,{workspaceId,actorId,action:'campaign.content_attached',entityType:'content',entityId:dto.contentId,metadata:{campaignId}}); return tx.content.findUniqueOrThrow({where:{id:dto.contentId}}); });
  }
  async transition(workspaceId:string,actorId:string,id:string,dto:TransitionDto) {
    const result=await this.db.$transaction(async tx=>{
      const level=dto.status==='APPROVED'||dto.status==='REJECTED'?'approve':'write';await this.role(tx,workspaceId,actorId,level);
      const row=await tx.content.findUnique({where:{workspaceId_id:{workspaceId,id}}});if(!row)throw new NotFoundException();
      if(row.version!==dto.expectedVersion)throw new ConflictException('Content version conflict');
      if(!transitions[row.status].includes(dto.status as ContentStatus))throw new ConflictException('Invalid workflow transition');
      if(dto.status==='IN_REVIEW'){
        if(!dto.reviewerId||dto.reviewerId===actorId)throw new BadRequestException('Another reviewer is required');
        const reviewer=await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId,userId:dto.reviewerId}},select:{role:true}});
        if(!reviewer||!['OWNER','ADMIN'].includes(reviewer.role))throw new BadRequestException('Reviewer must be a workspace manager');
        await this.identity.requireActiveVerifiedUser(tx,dto.reviewerId);
      }
      if(['APPROVED','REJECTED'].includes(dto.status)&&row.reviewerId!==actorId)throw new ForbiddenException('Only the assigned reviewer may decide');
      if(dto.status==='REJECTED'&&!dto.reason?.trim())throw new BadRequestException('Rejection reason required');
      if(dto.status==='SCHEDULED'&&!row.scheduledAt)throw new ConflictException('Schedule time required');
      if(dto.status==='PUBLISHED'&&row.status!=='SCHEDULED')throw new ConflictException('Approval and schedule required');
      const changed=await tx.content.updateMany({where:{workspaceId,id,version:dto.expectedVersion,status:row.status},data:{status:dto.status as ContentStatus,reviewerId:dto.status==='IN_REVIEW'?dto.reviewerId:undefined,reviewRequesterId:dto.status==='IN_REVIEW'?actorId:undefined,publishedAt:dto.status==='PUBLISHED'?new Date():undefined,version:{increment:1}}});
      if(!changed.count)throw new ConflictException('Content version conflict');
      await this.audit.record(tx,{workspaceId,actorId,action:`content.${dto.status.toLowerCase()}`,entityType:'content',entityId:id,metadata:{version:dto.expectedVersion+1,reason:dto.reason?.trim()??null,reviewerId:dto.reviewerId??row.reviewerId}});
      const recipients=dto.status==='IN_REVIEW'?[dto.reviewerId!]:['APPROVED','REJECTED'].includes(dto.status)?[row.reviewRequesterId,row.ownerId]:dto.status==='FAILED'?[row.ownerId,row.assigneeId]:[];
      const type=dto.status==='IN_REVIEW'?'CONTENT_REVIEW_REQUESTED':dto.status==='APPROVED'?'CONTENT_APPROVED':dto.status==='REJECTED'?'CONTENT_REJECTED':'PUBLISHING_ERROR';
      const notices=[];for(const userId of [...new Set(recipients.filter((value):value is string=>!!value&&value!==actorId))]){const notice=await this.notifications.create(tx,{userId,workspaceId,eventType:type,dedupeKey:`content:${id}:${dto.expectedVersion+1}:${type}`,title:type.replaceAll('_',' '),body:dto.status==='REJECTED'?dto.reason!.trim():row.title,url:`/w/${workspaceId}/content/${id}`});if(notice)notices.push(notice);}
      return {content:await tx.content.findUniqueOrThrow({where:{id}}),notices};
    });if(result.notices.length)await this.notifications.announce(result.notices);return result.content;
  }
  async schedule(workspaceId:string,actorId:string,id:string,dto:ScheduleDto) {
    const scheduledAt=utc(dto.scheduledAt); if(!scheduledAt)throw new BadRequestException('Schedule time required');
    return this.db.$transaction(async tx=>{ await this.role(tx,workspaceId,actorId,'write'); const row=await tx.content.findFirst({where:{workspaceId,id}}); if(!row)throw new NotFoundException(); if(row.version!==dto.expectedVersion)throw new ConflictException('Content version conflict'); if(!['APPROVED','SCHEDULED','FAILED'].includes(row.status))throw new ConflictException('Approval required before scheduling'); const changed=await tx.content.updateMany({where:{workspaceId,id,version:dto.expectedVersion,status:row.status},data:{scheduledAt,status:'SCHEDULED',version:{increment:1}}}); if(!changed.count)throw new ConflictException('Content version conflict'); await this.audit.record(tx,{workspaceId,actorId,action:'content.scheduled',entityType:'content',entityId:id,metadata:{scheduledAt:scheduledAt.toISOString(),version:dto.expectedVersion+1}}); return tx.content.findUniqueOrThrow({where:{id}}); });
  }
  async calendar(workspaceId:string,actorId:string,q:CalendarQuery) {
    const from=utc(q.from),to=utc(q.to); if(!from||!to||from>=to||to.getTime()-from.getTime()>93*86400000)throw new BadRequestException('Calendar range must span at most 93 days');
    return this.db.$transaction(async tx=>{ await this.role(tx,workspaceId,actorId); const workspace=await tx.workspace.findUniqueOrThrow({where:{id:workspaceId},select:{timezone:true}}); const items=await tx.content.findMany({where:{workspaceId,scheduledAt:{gte:from,lt:to},status:q.status as ContentStatus|undefined,brandId:q.brandId},orderBy:[{scheduledAt:'asc'},{id:'asc'}],take:1000,select:{id:true,title:true,status:true,version:true,brandId:true,campaignId:true,scheduledAt:true,publishedAt:true}}); return {timezone:workspace.timezone,items}; });
  }
}
