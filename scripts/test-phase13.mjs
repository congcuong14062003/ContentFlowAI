import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {PrismaClient}=require('@prisma/client');
const Redis=require('ioredis');
const {NotificationService}=require('../apps/api/dist/notifications/notification.service.js');
const {CollaborationService}=require('../apps/api/dist/collaboration/collaboration.service.js');
const {CampaignService}=require('../apps/api/dist/campaigns/campaign.service.js');
const {startNotificationJobs}=require('../apps/worker/dist/notification-jobs.js');

async function main(){
  if(!process.env.DATABASE_URL?.includes('contentflow-phase13-db'))throw Error('Run only against disposable Phase 13 database');
  const db=new PrismaClient();const redis=new Redis('redis://contentflow-phase13-redis:6379');
  const config={get:(key)=>key==='MAIL_MODE'?'local':'http://localhost'};
  const notifications=new NotificationService(db,{client:redis},{enqueue:async()=>{throw Error('Local mail fallback must stay disabled');}},config);
  const workspace={authorize:async(tx,w,userId)=>{const member=await tx.membership.findUnique({where:{workspaceId_userId:{workspaceId:w,userId}}});if(!member)throw Error('workspace denied');return member.role;}};
  const identity={requireActiveVerifiedUser:async(tx,id)=>{const user=await tx.user.findUnique({where:{id}});if(!user?.emailVerifiedAt||user.disabledAt)throw Error('inactive');}};
  const audit={record:(tx,input)=>tx.auditEvent.create({data:{...input,requestId:'phase13-test'}})};
  try{
    await notifications.onModuleInit();
    const owner=await db.user.create({data:{email:'phase13-owner@example.test',displayName:'Owner',emailVerifiedAt:new Date()}});
    const reviewer=await db.user.create({data:{email:'phase13-reviewer@example.test',displayName:'Reviewer',emailVerifiedAt:new Date()}});
    const editor=await db.user.create({data:{email:'phase13-editor@example.test',displayName:'Editor',emailVerifiedAt:new Date()}});
    const outsider=await db.user.create({data:{email:'phase13-outsider@example.test',displayName:'Outsider',emailVerifiedAt:new Date()}});
    const first=await db.workspace.create({data:{name:'Phase 13 A',slug:'phase13-a'}});const second=await db.workspace.create({data:{name:'Phase 13 B',slug:'phase13-b'}});
    for(const [workspaceId,userId,role] of [[first.id,owner.id,'OWNER'],[first.id,reviewer.id,'ADMIN'],[first.id,editor.id,'EDITOR'],[second.id,outsider.id,'OWNER']])await db.membership.create({data:{workspaceId,userId,role}});
    const content=await db.content.create({data:{workspaceId:first.id,title:'Review this',body:{},status:'DRAFT',ownerId:owner.id,assigneeId:editor.id}});
    const collaboration=new CollaborationService(db,workspace,identity,audit,notifications);
    const campaign=new CampaignService(db,workspace,identity,audit,{},notifications);
    await assert.rejects(collaboration.assign(first.id,content.id,editor.id,{expectedVersion:1,assigneeId:editor.id}));
    await assert.rejects(collaboration.assign(first.id,content.id,owner.id,{expectedVersion:1,assigneeId:outsider.id}));
    const assigned=await collaboration.assign(first.id,content.id,owner.id,{expectedVersion:1,assigneeId:editor.id});assert.equal(assigned.version,2);
    await assert.rejects(collaboration.comment(first.id,content.id,editor.id,{body:'invalid mention',mentions:[outsider.id]}));
    const comment=await collaboration.comment(first.id,content.id,editor.id,{body:'Please review',mentions:[reviewer.id]});
    assert.equal(comment.body,'Please review');
    assert.equal((await notifications.list(reviewer.id,{limit:20})).items.some(item=>item.eventType==='COMMENT_MENTION'),true);
    await assert.rejects(collaboration.comments(first.id,content.id,outsider.id,{limit:20}));
    await assert.rejects(collaboration.timeline(first.id,content.id,outsider.id,{limit:20}));
    const requested=await campaign.transition(first.id,editor.id,content.id,{expectedVersion:2,status:'IN_REVIEW',reviewerId:reviewer.id});assert.equal(requested.status,'IN_REVIEW');
    await assert.rejects(campaign.transition(first.id,owner.id,content.id,{expectedVersion:3,status:'APPROVED'}));
    await db.membership.update({where:{workspaceId_userId:{workspaceId:first.id,userId:reviewer.id}},data:{role:'VIEWER'}});
    await assert.rejects(campaign.transition(first.id,reviewer.id,content.id,{expectedVersion:3,status:'APPROVED'}));
    await db.membership.update({where:{workspaceId_userId:{workspaceId:first.id,userId:reviewer.id}},data:{role:'ADMIN'}});
    await assert.rejects(campaign.transition(first.id,reviewer.id,content.id,{expectedVersion:3,status:'REJECTED',reason:'  '}));
    const rejected=await campaign.transition(first.id,reviewer.id,content.id,{expectedVersion:3,status:'REJECTED',reason:'Please correct the claim'});assert.equal(rejected.status,'REJECTED');
    const history=await collaboration.timeline(first.id,content.id,owner.id,{limit:20});assert.equal(history.items.some(item=>item.action==='content.rejected'&&item.metadata.reason==='Please correct the claim'),true);
    assert.equal((await notifications.count(editor.id))>0,true);
    await notifications.markAllRead(editor.id);assert.equal(await notifications.count(editor.id),0);
    const inbox=await notifications.list(editor.id,{limit:20});const item=inbox.items[0];await notifications.state(editor.id,item.id,'unread');assert.equal(await notifications.count(editor.id),1);
    await assert.rejects(notifications.state(outsider.id,item.id,'read'));
    await notifications.state(editor.id,item.id,'archive');assert.equal((await notifications.list(editor.id,{limit:20})).items.some(row=>row.id===item.id),false);
    await notifications.state(editor.id,item.id,'restore');await notifications.state(editor.id,item.id,'delete');assert.equal((await notifications.list(editor.id,{limit:20})).items.some(row=>row.id===item.id),false);
    const firstNotice=await db.$transaction(tx=>notifications.create(tx,{userId:owner.id,workspaceId:first.id,eventType:'CONTENT_ASSIGNED',dedupeKey:'phase13-dedupe',title:'Assigned',body:'Check content',url:`/w/${first.id}/content/${content.id}`}));
    const duplicate=await db.$transaction(tx=>notifications.create(tx,{userId:owner.id,workspaceId:first.id,eventType:'CONTENT_ASSIGNED',dedupeKey:'phase13-dedupe',title:'Assigned',body:'Check content',url:`/w/${first.id}/content/${content.id}`}));assert.equal(duplicate,null);
    const delivered=new Promise(resolve=>{const unsubscribe=notifications.subscribe(owner.id,id=>{unsubscribe();resolve(id);});});await notifications.announce([firstNotice]);assert.equal(await Promise.race([delivered,new Promise((_,reject)=>setTimeout(()=>reject(Error('realtime timeout')),3000))]),firstNotice.id);
    const reconnected=await notifications.list(owner.id,{limit:20});assert.equal(reconnected.items.some(row=>row.id===firstNotice.id),true);
    const soon=new Date(Date.now()+30*60_000);
    await db.content.create({data:{workspaceId:first.id,title:'Scheduled check',body:{},status:'SCHEDULED',scheduledAt:soon,ownerId:owner.id}});
    const plan=await db.plan.create({data:{code:'PHASE13',name:'Phase 13 plan',monthlyCredits:0n,priceMinor:1000n,currency:'USD'}});
    const subscription=await db.subscription.create({data:{workspaceId:first.id,planId:plan.id,provider:'phase13',externalId:'phase13-sub',status:'ACTIVE',currentPeriodEnd:new Date(Date.now()+2*86400_000)}});
    const invoice=await db.invoice.create({data:{workspaceId:first.id,subscriptionId:subscription.id,planId:plan.id,amountMinor:1000n,currency:'USD',status:'PENDING',periodStart:new Date(),periodEnd:soon}});
    await db.payment.create({data:{workspaceId:first.id,subscriptionId:subscription.id,invoiceId:invoice.id,provider:'phase13',externalId:'phase13-pay',amountMinor:1000n,currency:'USD',status:'FAILED'}});
    await db.$transaction(async tx=>{
      const account=await tx.creditAccount.create({data:{workspaceId:first.id,balance:5n}});
      await tx.creditGrant.create({data:{workspaceId:first.id,accountId:account.id,source:'ADMIN',amount:6n,remaining:5n,idempotencyKey:'phase13-grant',fingerprint:'phase13-test',reference:'test'}});
      await tx.creditLedgerEntry.createMany({data:[{workspaceId:first.id,accountId:account.id,kind:'GRANT',amount:6n,idempotencyKey:'phase13-funding'},{workspaceId:first.id,accountId:account.id,kind:'RESERVE',amount:0n,reservedDelta:1n,idempotencyKey:'phase13-reserve'},{workspaceId:first.id,accountId:account.id,kind:'USAGE',amount:-1n,reservedDelta:-1n,idempotencyKey:'phase13-usage'}]});
    });
    await db.notificationPreference.upsert({where:{userId:owner.id},create:{userId:owner.id,lowCreditThreshold:10n},update:{lowCreditThreshold:10n}});
    const jobWarnings=[];
    const jobs=startNotificationJobs(db,redis,{MAIL_MODE:'local'}, {warn:(warning)=>jobWarnings.push(warning)});
    try{
      let events=[];
      for(let attempt=0;attempt<40;attempt++){
        events=await db.notification.findMany({where:{userId:owner.id,eventType:{in:['SCHEDULED_REMINDER','SUBSCRIPTION_EXPIRING','PAYMENT_FAILED','CREDIT_LOW']}},select:{eventType:true}});
        if(new Set(events.map(row=>row.eventType)).size===4)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.deepEqual(jobWarnings,[]);
      assert.deepEqual(new Set(events.map(row=>row.eventType)),new Set(['SCHEDULED_REMINDER','SUBSCRIPTION_EXPIRING','PAYMENT_FAILED','CREDIT_LOW']));
    }finally{jobs.close();}
    await db.membership.delete({where:{workspaceId_userId:{workspaceId:first.id,userId:owner.id}}});assert.equal((await notifications.list(owner.id,{limit:20})).items.some(row=>row.id===firstNotice.id),false);
    assert.equal(await notifications.visibleEvent(owner.id,firstNotice.id),null);
    console.log('Phase 13 role approvals, isolation, comments, notification ownership/dedupe, realtime reconnect, background events and permission changes passed');
  }finally{await notifications.onModuleDestroy();redis.disconnect();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
