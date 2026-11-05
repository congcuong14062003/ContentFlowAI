import 'reflect-metadata';
import { config } from 'dotenv'; import { createRequire } from 'node:module'; import { randomUUID, randomBytes, createHash } from 'node:crypto'; import { spawnSync } from 'node:child_process'; import { createServer } from 'node:http'; import assert from 'node:assert/strict';
import { generatorFixtureOutput, generatorReference } from './fixtures/generator.mjs';
config({ path: '.env', quiet: true }); const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost','127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Generator QA requires local PostgreSQL');
const schema = `cf_generator_${randomUUID().replaceAll('-','')}`; const url = new URL(original); url.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: original } } }); let db; let app; let passed = 0; let runtimeConfig; const requests = [];
const provider = createServer(async (req, res) => {
  if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"data":[]}'); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks)); const source = generatorReference(body.messages[0].content); requests.push({ body, source });
  const marker = source.input.params.topic;
  if (marker === 'PROVIDER_ERROR') { res.writeHead(400); res.end('{}'); return; }
  if (marker === 'TIMEOUT') await new Promise(resolve => setTimeout(resolve, 800));
  if (marker === 'SLOW') await new Promise(resolve => setTimeout(resolve, 100));
  if (res.destroyed) return;
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: randomUUID(), model: body.model, choices: [{ message: { content: marker === 'INVALID_OUTPUT' ? '{"schemaVersion":1,"variations":[]}' : JSON.stringify(generatorFixtureOutput(source.input)) } }], usage: { prompt_tokens: 100, completion_tokens: 200 } }));
});
async function check(name, fn) { runtimeConfig?.set('RATE_LIMIT_PREFIX', `${schema}_case${passed}`); await fn(); passed++; console.log(`PASS ${name}`); }
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  assert.match(schema, /^cf_generator_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const routing = { providers: [{ id:'fixture',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,keyEnv:'AI_SECRET_GENERATOR_FIXTURE' }], models: [{ id:'fixture-text',provider:'fixture',model:'fixture-text',priceVersion:'qa-v1',capability:'TEXT',tasks:['TEXT_GENERATION'],maxInputTokens:60000,maxOutputTokens:16000,contextTokens:100000,inputMicrosPerMillion:'1000000',outputMicrosPerMillion:'1000000' }] };
  Object.assign(process.env, { DATABASE_URL:url.toString(),NODE_ENV:'test',LOG_LEVEL:'fatal',RATE_LIMIT_PREFIX:schema,AI_ENABLED:'true',AI_ROUTING_CONFIG:JSON.stringify(routing),AI_SECRET_GENERATOR_FIXTURE:randomBytes(32).toString('hex'),AI_TIMEOUT_MS:'350',AI_CREDIT_MICROS_PER_ATOM:'1' });
  for (let n=0;n<2;n++) { const result = spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema','apps/api/prisma/schema.prisma'],{env:process.env,encoding:'utf8'}); assert.equal(result.status,0,result.stderr || result.stdout); }
  db = new PrismaClient();
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js'); const { ConfigService } = require('@nestjs/config');
  app = await NestFactory.create(AppModule,{bufferLogs:true,abortOnError:false}); await configureApp(app); await app.listen(0,'127.0.0.1'); runtimeConfig = app.get(ConfigService); let base = `${await app.getUrl()}/api/v1`;
  async function actor(systemRole='USER') { const user=await db.user.create({data:{email:`${randomUUID()}@example.invalid`,displayName:'Generator QA',emailVerifiedAt:new Date(),systemRole}}); const token=randomBytes(32).toString('base64url'); await db.session.create({data:{userId:user.id,familyId:randomUUID(),refreshTokenHash:hash(randomUUID()),accessTokenHash:hash(token),accessExpiresAt:new Date(Date.now()+3600000),expiresAt:new Date(Date.now()+3600000)}}); return {id:user.id,token}; }
  const owner=await actor(); const sysadmin=await actor('SUPER_ADMIN'); const viewer=await actor(); const outsider=await actor();
  async function call(path,method='GET',body,token=owner.token) { const response=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}); const value=await response.json(); return {status:response.status,...value}; }
  const w=(await call('/workspaces','POST',{name:'Generator QA workspace'})).data.id; const other=(await call('/workspaces','POST',{name:'Other QA workspace'},outsider.token)).data.id;
  await db.membership.create({data:{workspaceId:w,userId:viewer.id,role:'VIEWER'}});
  const kit={schemaVersion:1,colors:['#112233'],industry:'Software',businessDescription:'Known company description',targetAudiences:['Teams'],voice:'Warm and concise',tone:['Calm'],keywords:['clarity'],forbiddenPhrases:['guaranteed results'],preferredCta:'Request a demo',languages:['vi','en'],socialPlatforms:['facebook'],aiInstructions:'Respect supplied source facts'};
  const brand=(await call(`/workspaces/${w}/brands`,'POST',{name:'Verified QA brand',guidelines:kit})).data.id;
  const product=(await call(`/workspaces/${w}/products`,'POST',{name:'Sourced QA product',description:'Catalog description',priceReference:'Contact sales',features:['Known feature'],benefits:['Known benefit'],audiences:['Teams'],categories:['Software'],tags:['test'],status:'ACTIVE',brandIds:[brand]})).data.id;
  const policy={enabled:true,dailyCapMicros:'5000000',requestsPerMinute:1000,maxConcurrent:20};
  assert.equal((await call('/admin/ai/policy','PUT',policy,sysadmin.token)).status,200); assert.equal((await call(`/admin/workspaces/${w}/ai/policy`,'PUT',policy,sysadmin.token)).status,200);
  assert.equal((await call(`/admin/workspaces/${w}/credits/grants`,'POST',{source:'PURCHASE',amount:'2000000',reference:randomUUID(),idempotencyKey:randomUUID(),reason:'Isolated generator QA funding'},sysadmin.token)).status,201);
  const path=`/workspaces/${w}/generator`; const gallery=(await call(`${path}/tools`)).data;
  function input(toolId='facebook_post',overrides={}) { const tool=gallery.find(t=>t.id===toolId); const params=Object.fromEntries(tool.fields.map(field=>[field.key,field.type==='number'?field.min:field.type==='select'?field.options[0]:field.type==='month'?'2028-02':field.key==='startDate'?'2026-11-04':'A supplied topic'])); return {toolId,brandId:brand,productIds:[product],audience:'Marketing teams',platform:tool.platforms[0],variantPlatforms:[],tone:'Clear',language:'en',objective:'Explain the sourced product',variations:1,verifiedFacts:['The catalog feature is provided by the user.'],params,...overrides}; }
  async function quote(value=input()) { const response=await call(`${path}/quotes`,'POST',value); assert.equal(response.status,201,JSON.stringify(response.error)); return response.data; }
  async function create(quoteId,idempotencyKey=randomUUID()) { const response=await call(`${path}/runs`,'POST',{quoteId,idempotencyKey}); assert.equal(response.status,202,JSON.stringify(response.error)); return response.data; }
  async function finish(id) { for(let n=0;n<200;n++) { const response=await call(`${path}/runs/${id}`); assert.equal(response.status,200,JSON.stringify(response.error)); if(!['PENDING','RESERVED','RUNNING'].includes(response.data.status))return response.data; await new Promise(resolve=>setTimeout(resolve,25)); } throw new Error('Run did not reach an observable terminal/unknown status'); }
  let completed;
  await check('registry exposes all 12 tools and invalid task inputs cannot reserve or dispatch',async()=>{
    assert.equal(gallery.length,12); const count=requests.length;
    for(const invalid of [{...input(),params:{}},{...input(),costMicros:'0'},{...input(),variations:6},{...input('product_description'),productIds:[]},{...input('monthly_plan'),params:{theme:'Test',month:'2028-13'}},{...input(),platform:'tiktok'}]) assert.equal((await call(`${path}/quotes`,'POST',invalid)).status,400);
    assert.equal(requests.length,count); assert.equal(await db.creditReservation.count({where:{workspaceId:w}}),0);
  });
  await check('all 12 tools generate validated persisted outputs through gateway and charge measured usage',async()=>{
    for(const tool of gallery) { const value=input(tool.id,tool.id==='facebook_post'?{variations:2,variantPlatforms:['instagram']}:{}); const estimate=await quote(value); const run=await create(estimate.id); const result=await finish(run.id); assert.equal(result.status,'SUCCEEDED',`${tool.id}: ${result.errorCode}`); assert.equal(result.result.variations.length,value.variations); assert.equal(result.usage.credits,'300'); if(tool.id==='monthly_plan')assert.equal(result.result.variations[0].planEntries.length,29); if(tool.id==='facebook_post')completed=result; }
    assert.equal(requests.length,12); const credits=(await call(`/workspaces/${w}/credits/balance`)).data; assert.equal(credits.available,'1996400'); assert.equal(credits.reserved,'0');
  });
  await check('source snapshot injects brand voice, forbidden phrases, actual products and anti-fabrication policy',async()=>{
    const request=requests[0]; assert.equal(request.source.brand.kit.voice,'Warm and concise'); assert.deepEqual(request.source.brand.kit.forbiddenPhrases,['guaranteed results']); assert.equal(request.source.products[0].name,'Sourced QA product'); assert.equal(request.source.products[0].features[0],'Known feature');
    assert.match(JSON.parse(request.body.messages[0].content).request,/Never invent statistics/); assert.equal(request.body.n,1);
    const q=await db.generatorQuote.findFirstOrThrow({where:{workspaceId:w}}); await assert.rejects(db.generatorQuote.update({where:{id:q.id},data:{snapshot:{}}}));
  });
  await check('concurrent duplicate requests and restoring the same key do not call provider or charge twice',async()=>{
    const q=await quote(input('facebook_post',{params:{topic:'SLOW',postStyle:'educational'}})); const operation=randomUUID(); const before=requests.length;
    const runs=await Promise.all(Array.from({length:4},()=>create(q.id,operation))); assert.equal(new Set(runs.map(run=>run.id)).size,1); const result=await finish(runs[0].id); assert.equal(result.status,'SUCCEEDED'); assert.equal(requests.length-before,1);
    assert.equal((await create(q.id,operation)).id,result.id); assert.equal(requests.length-before,1);
    assert.equal((await call(`${path}/runs`,'POST',{quoteId:q.id,idempotencyKey:randomUUID()})).status,409);
    const another=await quote(); assert.equal((await call(`${path}/runs`,'POST',{quoteId:another.id,idempotencyKey:operation})).status,409);
  });
  await check('save per variation is idempotent, restores from database and creates one initial revision',async()=>{
    const saved=await Promise.all(Array.from({length:3},()=>call(`${path}/runs/${completed.id}/drafts`,'POST',{variationIndex:0}))); for(const r of saved)assert.equal(r.status,201); assert.equal(new Set(saved.map(r=>r.data.id)).size,1);
    const id=saved[0].data.id; assert.equal((await call(`${path}/drafts/${id}`)).data.body.variation.title,completed.result.variations[0].title); assert.equal(await db.contentRevision.count({where:{workspaceId:w,contentId:id}}),1);
    const restored=await call(`${path}/runs/${completed.id}`); assert.deepEqual(restored.data.result,completed.result); assert.equal(restored.data.drafts.length,1);
    assert.equal((await call(`${path}/runs/${completed.id}/drafts`,'POST',{variationIndex:1})).status,201); assert.equal((await call(`${path}/runs/${completed.id}/drafts`,'POST',{variationIndex:4})).status,400);
    await assert.rejects(db.generatorRun.update({where:{id:completed.id},data:{result:{schemaVersion:999}}}));
  });
  await check('content edit versions reject stale writes, restore snapshots and isolate tenants',async()=>{
    const draft=await db.generatedDraft.findFirstOrThrow({where:{workspaceId:w,runId:completed.id,variationIndex:0}}); const id=draft.contentId; const contentPath=`/workspaces/${w}/content/${id}`;
    const initial=await call(contentPath); assert.equal(initial.status,200); assert.equal(initial.data.version,1);
    assert.equal((await call(contentPath,'PUT',{expectedVersion:1,title:'Viewer edit',text:'Denied'},viewer.token)).status,403);
    assert.equal((await call(`/workspaces/${other}/content/${id}`,'GET',undefined,outsider.token)).status,404);
    const saved=await call(contentPath,'PUT',{expectedVersion:1,title:'Edited title',text:'Edited body'}); assert.equal(saved.status,200,JSON.stringify(saved.error)); assert.equal(saved.data.version,2); assert.equal(saved.data.body.variation.mainText,'Edited body');
    assert.equal((await call(contentPath,'PUT',{expectedVersion:1,title:'Stale',text:'Lost'})).status,409);
    const history=await call(`${contentPath}/revisions`); assert.equal(history.status,200); assert.deepEqual(history.data.map(item=>item.version),[2,1]); assert.equal(history.data[0].actorId,owner.id);
    const restored=await call(`${contentPath}/restore`,'POST',{expectedVersion:2,version:1}); assert.equal(restored.status,201,JSON.stringify(restored.error)); assert.equal(restored.data.version,3); assert.equal(restored.data.body.variation.mainText,initial.data.body.variation.mainText);
    assert.equal((await call(contentPath)).data.version,3); assert.equal(await db.contentRevision.count({where:{workspaceId:w,contentId:id}}),3);
    assert.equal((await call(`/workspaces/${w}/content`)).data.items.some(item=>item.id===id),true);
  });
  await check('invalid structured output records real provider cost and refunds credits atomically',async()=>{
    const before=(await call(`/workspaces/${w}/credits/balance`)).data.balance; const q=await quote(input('facebook_post',{params:{topic:'INVALID_OUTPUT',postStyle:'educational'}})); const result=await finish((await create(q.id)).id);
    assert.equal(result.status,'INVALID_OUTPUT'); assert.equal(result.result,null); assert.equal(result.usage.costMicros,'300'); assert.ok(result.reservation.refundedAt); assert.equal(result.credits.balance,before); assert.equal(result.credits.reserved,'0');
    assert.equal((await call(`${path}/runs/${result.id}/drafts`,'POST',{variationIndex:0})).status,409);
    const binding=await db.generatorRun.findUniqueOrThrow({where:{id:result.id}}); assert.equal(await db.creditLedgerEntry.count({where:{workspaceId:w,kind:'REFUND',reference:binding.aiGenerationId}}),1);
  });
  await check('definitive provider error releases reservation; safe restore never resends a terminal request',async()=>{
    const before=(await call(`/workspaces/${w}/credits/balance`)).data.balance; const q=await quote(input('facebook_post',{params:{topic:'PROVIDER_ERROR',postStyle:'educational'}})); const id=(await create(q.id)).id; const result=await finish(id); assert.equal(result.status,'FAILED'); assert.equal(result.credits.balance,before); assert.equal(result.credits.reserved,'0'); const count=requests.length;
    assert.equal((await call(`${path}/runs/${id}/resume`,'POST')).status,202); await finish(id); assert.equal(requests.length,count);
  });
  await check('timeout remains unknown and cannot be retried into a second provider charge',async()=>{
    const q=await quote(input('facebook_post',{params:{topic:'TIMEOUT',postStyle:'educational'}})); const id=(await create(q.id)).id; const result=await finish(id); assert.equal(result.status,'UNKNOWN'); assert.notEqual(result.credits.reserved,'0'); const count=requests.length;
    await call(`${path}/runs/${id}/resume`,'POST'); await finish(id); assert.equal(requests.length,count);
    const generation=await db.generatorRun.findUniqueOrThrow({where:{id}}); assert.equal((await call(`/admin/workspaces/${w}/ai/reconcile/${generation.aiGenerationId}`,'POST',{outcome:'UNBILLED',evidence:'Fixture operator confirmed no provider charge'},sysadmin.token)).status,201); assert.equal((await finish(id)).credits.reserved,'0');
  });
  await check('insufficient credits, expired previews and cross-tenant product selections never invoke provider',async()=>{
    const empty=(await call('/workspaces','POST',{name:'Unfunded workspace'})).data.id;
    const emptyBrand=(await call(`/workspaces/${empty}/brands`,'POST',{name:'Unfunded brand',guidelines:kit})).data.id; await call(`/admin/workspaces/${empty}/ai/policy`,'PUT',policy,sysadmin.token);
    const before=requests.length; const q=(await call(`/workspaces/${empty}/generator/quotes`,'POST',input('facebook_post',{brandId:emptyBrand,productIds:[]}))).data; assert.ok(q?.id);
    const id=(await call(`/workspaces/${empty}/generator/runs`,'POST',{quoteId:q.id,idempotencyKey:randomUUID()})).data.id;
    let status; for(let n=0;n<100;n++){status=(await call(`/workspaces/${empty}/generator/runs/${id}`)).data;if(status.status==='FAILED')break;await new Promise(r=>setTimeout(r,20));} assert.equal(status.errorCode,'INSUFFICIENT_CREDITS'); assert.equal(requests.length,before);
    const valid=await quote(); const row=await db.generatorQuote.findUniqueOrThrow({where:{id:valid.id}}); const old=await db.generatorQuote.create({data:{workspaceId:w,actorId:owner.id,toolId:row.toolId,fingerprint:row.fingerprint,input:row.input,snapshot:row.snapshot,expiresAt:new Date(Date.now()-1000)}}); assert.equal((await call(`${path}/runs`,'POST',{quoteId:old.id,idempotencyKey:randomUUID()})).status,409);
    const orphan=await db.generatorRun.create({data:{workspaceId:w,actorId:owner.id,quoteId:old.id,idempotencyKey:randomUUID(),createdAt:new Date(Date.now()-180000)}}); const stale=(await call(`${path}/runs/${orphan.id}`)).data; assert.equal(stale.status,'FAILED'); assert.equal(stale.errorCode,'REQUEST_NOT_DISPATCHED'); assert.equal(requests.length,before);
    const staleSnapshot=JSON.parse(JSON.stringify(row.snapshot)); staleSnapshot.estimate.pricingFingerprint='old-deployment-price'; const stalePrice=await db.generatorQuote.create({data:{workspaceId:w,actorId:owner.id,toolId:row.toolId,fingerprint:row.fingerprint,input:row.input,snapshot:staleSnapshot,expiresAt:new Date(Date.now()+300000)}}); const repriced=await finish((await create(stalePrice.id)).id); assert.equal(repriced.status,'FAILED'); assert.equal(repriced.errorCode,'HTTP_409'); assert.equal(requests.length,before);
    const foreignBrand=(await call(`/workspaces/${other}/brands`,'POST',{name:'Foreign brand',guidelines:kit},outsider.token)).data.id; assert.equal((await call(`${path}/quotes`,'POST',input('facebook_post',{brandId:foreignBrand}))).status,404);
  });
  await check('workspace authorization protects quote, history, outputs, saved drafts and billing APIs',async()=>{
    assert.equal((await call(`${path}/quotes`,'POST',input(),viewer.token)).status,403); assert.equal((await call(`${path}/runs/${completed.id}/drafts`,'POST',{variationIndex:0},viewer.token)).status,403);
    assert.equal((await call(`${path}/runs/${completed.id}`,'GET',undefined,viewer.token)).status,200);
    for(const suffix of ['/tools','/runs',`/runs/${completed.id}`])assert.equal((await call(`${path}${suffix}`,'GET',undefined,outsider.token)).status,404);
    const draft=(await db.generatedDraft.findFirstOrThrow({where:{runId:completed.id}})).contentId; assert.equal((await call(`/workspaces/${other}/generator/drafts/${draft}`,'GET',undefined,outsider.token)).status,404);
    const first=await call(`${path}/runs?limit=2`); assert.ok(first.data.nextCursor); assert.equal((await call(`/workspaces/${other}/generator/runs?cursor=${first.data.nextCursor}`,'GET',undefined,outsider.token)).status,400);
  });
  await check('persisted results and saved drafts restore after Nest application restart without new provider calls',async()=>{
    const calls=requests.length; await app.close();
    app=await NestFactory.create(AppModule,{bufferLogs:true,abortOnError:false}); await configureApp(app); await app.listen(0,'127.0.0.1'); base=`${await app.getUrl()}/api/v1`; runtimeConfig=app.get(ConfigService);
    const restored=await call(path+'/runs/'+completed.id); assert.equal(restored.status,200); assert.deepEqual(restored.data.result,completed.result); assert.equal(restored.data.drafts.length,2); assert.equal(requests.length,calls);
  });
  console.log(`Generator QA: ${passed} scenarios passed; 12 tools exercised end-to-end with real PostgreSQL/Redis and test-only HTTP provider.`);
} finally {
  if(app)await app.close(); if(db)await db.$disconnect(); await new Promise(resolve=>provider.close(resolve)); provider.closeAllConnections();
  if(/^cf_generator_[a-f0-9]{32}$/.test(schema))await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
}
