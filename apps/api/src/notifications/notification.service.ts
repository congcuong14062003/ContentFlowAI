import { Inject, Injectable, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../platform/prisma.service';
import { RedisService } from '../platform/redis.service';
import { MailService } from '../identity/mail.service';
import { cursorPage, pageRange } from '../common/pagination';
import { NotificationPreferenceDto, NotificationQuery, type EventType } from './notification.dto';

type Tx=Prisma.TransactionClient;
const channel='contentflow:notification:created';
@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private subscriber?: Redis;
  private listeners=new Map<string,Set<(id:string)=>void>>();
  constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(RedisService) private readonly redis:RedisService,@Inject(MailService) private readonly mail:MailService,@Inject(ConfigService) private readonly config:ConfigService) {}
  async onModuleInit(){
    this.subscriber=this.redis.client.duplicate({lazyConnect:true});
    this.subscriber.on('error',()=>undefined);
    this.subscriber.on('message',(_channel,payload)=>{try{const event=JSON.parse(payload) as {userId:string;id:string};if(!/^[0-9a-f-]{36}$/i.test(event.userId)||!(event.id==='reset'||/^[0-9a-f-]{36}$/i.test(event.id)))return;for(const callback of this.listeners.get(event.userId)??[])callback(event.id);}catch{ /* ignore malformed pubsub payload */ }});
    try { await this.subscriber.subscribe(channel); } catch { /* persistence and reconnect sync remain available */ }
  }
  async onModuleDestroy(){this.listeners.clear();this.subscriber?.disconnect();}
  subscribe(userId:string,callback:(id:string)=>void){const set=this.listeners.get(userId)??new Set<(id:string)=>void>();set.add(callback);this.listeners.set(userId,set);return()=>{set.delete(callback);if(!set.size)this.listeners.delete(userId);};}
  async announce(notifications:{id:string;userId:string}[]){await Promise.allSettled(notifications.map(item=>this.redis.client.publish(channel,JSON.stringify(item))));}
  async reset(userId:string){await Promise.allSettled([this.redis.client.publish(channel,JSON.stringify({userId,id:'reset'}))]);}
  async create(tx:Tx,input:{userId:string;workspaceId?:string;eventType:EventType;dedupeKey:string;title:string;body:string;url:string},emailFallback=true){
    const recipient=await tx.user.findFirst({where:{id:input.userId,disabledAt:null,emailVerifiedAt:{not:null}},select:{email:true}});if(!recipient)return null;
    if(input.workspaceId&&input.eventType!=='TEAM_INVITATION'&&!await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId:input.workspaceId,userId:input.userId}}}))return null;
    const preference=await tx.notificationPreference.findUnique({where:{userId:input.userId}});
    if(preference?.mutedTypes.includes(input.eventType))return null;
    const inserted=await tx.notification.createMany({data:[input],skipDuplicates:true});
    if(!inserted.count)return null;
    const row=await tx.notification.findUniqueOrThrow({where:{userId_dedupeKey:{userId:input.userId,dedupeKey:input.dedupeKey}}});
    if(emailFallback&&preference?.emailEnabled&&this.config.get('MAIL_MODE')==='smtp') await this.mail.enqueue(tx,row.id,recipient.email,`ContentFlow AI: ${row.title}`,`${row.body}\n\n${this.config.get<string>('WEB_ORIGIN')}${row.url}`);
    return row;
  }
  private visible(userId:string):Prisma.NotificationWhereInput{return{userId,deletedAt:null,OR:[{workspaceId:null},{eventType:'TEAM_INVITATION'},{workspace:{archivedAt:null,memberships:{some:{userId}}}}]};}
  list(userId:string,q:NotificationQuery){const scope=`notifications:${userId}:${q.filter??'all'}`;return this.db.notification.findMany({where:{...this.visible(userId),archivedAt:q.filter==='archived'?{not:null}:null,...(q.filter==='unread'?{readAt:null}:{}),...pageRange(q,scope,true)},orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.limit+1,select:{id:true,workspaceId:true,eventType:true,title:true,body:true,url:true,readAt:true,archivedAt:true,createdAt:true}}).then(rows=>cursorPage(rows,q,scope));}
  count(userId:string){return this.db.notification.count({where:{...this.visible(userId),archivedAt:null,readAt:null}});}
  async state(userId:string,id:string,action:'read'|'unread'|'archive'|'restore'|'delete'){
    const data=action==='read'?{readAt:new Date()}:action==='unread'?{readAt:null}:action==='archive'?{archivedAt:new Date()}:action==='restore'?{archivedAt:null}:{deletedAt:new Date()};
    const changed=await this.db.notification.updateMany({where:{...this.visible(userId),id},data});if(!changed.count)throw new NotFoundException();return {updated:true};
  }
  async markAllRead(userId:string){const changed=await this.db.notification.updateMany({where:{...this.visible(userId),archivedAt:null,readAt:null},data:{readAt:new Date()}});return {updated:changed.count};}
  async visibleEvent(userId:string,id:string){return this.db.notification.findFirst({where:{...this.visible(userId),id},select:{id:true,eventType:true,createdAt:true}});}
  preferences(userId:string){return this.db.notificationPreference.findUnique({where:{userId},select:{emailEnabled:true,mutedTypes:true,lowCreditThreshold:true}}).then(row=>row??{emailEnabled:false,mutedTypes:[],lowCreditThreshold:null});}
  setPreferences(userId:string,dto:NotificationPreferenceDto){const data={emailEnabled:dto.emailEnabled,mutedTypes:dto.mutedTypes,lowCreditThreshold:dto.lowCreditThreshold===undefined?null:BigInt(dto.lowCreditThreshold)};return this.db.notificationPreference.upsert({where:{userId},create:{userId,...data},update:data,select:{emailEnabled:true,mutedTypes:true,lowCreditThreshold:true}});}
  async sessionValid(sessionId:string,userId:string){return !!await this.db.session.findFirst({where:{id:sessionId,userId,revokedAt:null,accessExpiresAt:{gt:new Date()},expiresAt:{gt:new Date()},user:{disabledAt:null}},select:{id:true}});}
}
