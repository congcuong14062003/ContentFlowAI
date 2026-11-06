import { PrismaClient, type Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { encryptMail } from '@contentflow/mail';

type Tx=Prisma.TransactionClient;
type EventType='CREDIT_LOW'|'PAYMENT_FAILED'|'SUBSCRIPTION_EXPIRING'|'SCHEDULED_REMINDER';
const channel='contentflow:notification:created';
export function startNotificationJobs(db:PrismaClient,redis:Redis,env:NodeJS.ProcessEnv,logger:Logger){
  let running=false;
  async function emit(input:{userId:string;workspaceId:string;eventType:EventType;dedupeKey:string;title:string;body:string;url:string}){
    const created=await db.$transaction(async(tx:Tx)=>{
      const member=await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId:input.workspaceId,userId:input.userId}},select:{user:{select:{email:true,disabledAt:true,emailVerifiedAt:true}},workspace:{select:{archivedAt:true}}}});
      if(!member||member.user.disabledAt||!member.user.emailVerifiedAt||member.workspace.archivedAt)return null;
      const preference=await tx.notificationPreference.findUnique({where:{userId:input.userId}});
      if(preference?.mutedTypes.includes(input.eventType))return null;
      const inserted=await tx.notification.createMany({data:[input],skipDuplicates:true});if(!inserted.count)return null;
      const row=await tx.notification.findUniqueOrThrow({where:{userId_dedupeKey:{userId:input.userId,dedupeKey:input.dedupeKey}}});
      if(preference?.emailEnabled&&env.MAIL_MODE==='smtp'&&env.MAIL_ENCRYPTION_KEY&&env.WEB_ORIGIN){
        const payload=encryptMail({to:member.user.email,subject:`ContentFlow AI: ${input.title}`,text:`${input.body}\n\n${env.WEB_ORIGIN}${input.url}`},env.MAIL_ENCRYPTION_KEY);
        await tx.outboxEvent.create({data:{topic:'identity.email',aggregateId:row.id,payload:{...payload}}});
      }
      return row;
    });
    if(created)await redis.publish(channel,JSON.stringify({userId:created.userId,id:created.id}));
  }
  async function scan(){if(running)return;running=true;try{
    const now=new Date();const hour=new Date(now.getTime()+3600000);const week=new Date(now.getTime()+7*86400000);
    const [scheduled,expiring,failed,thresholds]=await Promise.all([
      db.content.findMany({where:{status:'SCHEDULED',scheduledAt:{gt:now,lte:hour}},select:{id:true,workspaceId:true,title:true,scheduledAt:true,ownerId:true,assigneeId:true},take:500}),
      db.subscription.findMany({where:{status:'ACTIVE',currentPeriodEnd:{gt:now,lte:week}},select:{id:true,workspaceId:true,currentPeriodEnd:true,plan:{select:{name:true}}},take:500}),
      db.payment.findMany({where:{status:'FAILED',invoice:{status:{not:'VOID'}}},select:{id:true,workspaceId:true,amountMinor:true,currency:true,updatedAt:true},take:500}),
      db.notificationPreference.findMany({where:{lowCreditThreshold:{not:null}},select:{userId:true,lowCreditThreshold:true},take:500})
    ]);
    for(const item of scheduled)for(const userId of new Set([item.ownerId,item.assigneeId].filter((value):value is string=>!!value)))await emit({userId,workspaceId:item.workspaceId,eventType:'SCHEDULED_REMINDER',dedupeKey:`reminder:${item.id}:${item.scheduledAt!.toISOString()}`,title:'Scheduled content reminder',body:item.title,url:`/w/${item.workspaceId}/content/${item.id}`});
    for(const item of expiring){const members=await db.membership.findMany({where:{workspaceId:item.workspaceId,role:{in:['OWNER','ADMIN']}},select:{userId:true}});for(const member of members)await emit({userId:member.userId,workspaceId:item.workspaceId,eventType:'SUBSCRIPTION_EXPIRING',dedupeKey:`subscription-expiring:${item.id}:${item.currentPeriodEnd!.toISOString()}`,title:'Subscription expiring',body:item.plan.name,url:`/w/${item.workspaceId}/billing`});}
    for(const item of failed){const members=await db.membership.findMany({where:{workspaceId:item.workspaceId,role:{in:['OWNER','ADMIN']}},select:{userId:true}});for(const member of members)await emit({userId:member.userId,workspaceId:item.workspaceId,eventType:'PAYMENT_FAILED',dedupeKey:`payment-failed:${item.id}`,title:'Payment failed',body:'A payment requires attention',url:`/w/${item.workspaceId}/billing`});}
    for(const pref of thresholds){const memberships=await db.membership.findMany({where:{userId:pref.userId},select:{workspaceId:true}});for(const member of memberships){const account=await db.creditAccount.findUnique({where:{workspaceId:member.workspaceId},select:{balance:true,reserved:true}});if(!account||account.balance-account.reserved>pref.lowCreditThreshold!)continue;const usage=await db.creditLedgerEntry.findFirst({where:{workspaceId:member.workspaceId,kind:'USAGE',createdAt:{gte:new Date(now.getTime()-86400000)}},orderBy:{createdAt:'desc'},select:{id:true}});if(!usage)continue;await emit({userId:pref.userId,workspaceId:member.workspaceId,eventType:'CREDIT_LOW',dedupeKey:`credit-low:${member.workspaceId}:${now.toISOString().slice(0,10)}`,title:'Credit balance low',body:'Available credits are below your chosen threshold',url:`/w/${member.workspaceId}/credits`});}}
  }catch(error){logger.warn({errorType:error instanceof Error?error.name:'Unknown'},'Notification job scan failed');}finally{running=false;}}
  void scan();const timer=setInterval(()=>{void scan();},60000);timer.unref();return{close:()=>clearInterval(timer)};
}
