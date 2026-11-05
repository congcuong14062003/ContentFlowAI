import 'reflect-metadata'; import { config } from 'dotenv'; import { createRequire } from 'node:module'; import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process'; import { mkdir, readdir, readFile, rm } from 'node:fs/promises'; import { resolve } from 'node:path'; import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { generatorFixtureOutput, generatorReference } from './fixtures/generator.mjs';
import { startMailWorker, startMailDispatcher } from '@contentflow/mail';
config({ path: '.env', quiet: true }); const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost', '127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Browser QA requires a local database');
const schema = `cf_browser_${randomUUID().replaceAll('-', '')}`; const url = new URL(original); url.searchParams.set('schema', schema);
const reservation = createServer(); await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve)); const webPort = reservation.address().port; await new Promise((resolve) => reservation.close(resolve)); const webOrigin = `http://localhost:${webPort}`;
const production = process.env.BROWSER_MODE === 'production';
const mailbox = resolve('.local', schema); const artifacts = resolve(production ? '.local/qa/production' : '.local/qa'); await mkdir(mailbox, { recursive: true }); await mkdir(artifacts, { recursive: true });
const admin = new PrismaClient({ datasources: { db: { url: original } } }); let app; let browser; let vite; let mailWorker; let dispatcher; let testDb; let providerFixture; let providerCalls = 0; let passed = 0;
async function check(name, fn) { if (app) app.get(require('@nestjs/config').ConfigService).set('RATE_LIMIT_PREFIX', `${schema}_case${passed}`); await fn(); passed++; console.log(`PASS ${name}`); }
try {
  providerFixture = createHttpServer(async (req, res) => {
    if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"data":[]}'); return; }
    const chunks=[]; for await (const chunk of req) chunks.push(chunk); const body=JSON.parse(Buffer.concat(chunks)); const source=generatorReference(body.messages[0].content); providerCalls++;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({id:randomUUID(),model:body.model,choices:[{message:{content: source.input.params.topic === 'INVALID_OUTPUT' ? '{}' : JSON.stringify(generatorFixtureOutput(source.input))}}],usage:{prompt_tokens:100,completion_tokens:200}}));
  });
  await new Promise(resolve => providerFixture.listen(0,'127.0.0.1',resolve));
  Object.assign(process.env, { AI_ENABLED:'true',AI_SECRET_BROWSER_FIXTURE:randomUUID(),AI_TIMEOUT_MS:'30000',AI_ROUTING_CONFIG:JSON.stringify({providers:[{id:'browser-fixture',baseUrl:'http://127.0.0.1:'+providerFixture.address().port+'/v1',keyEnv:'AI_SECRET_BROWSER_FIXTURE'}],models:[{id:'browser-text',provider:'browser-fixture',model:'browser-text',priceVersion:'test-v1',capability:'TEXT',tasks:['TEXT_GENERATION'],maxInputTokens:60000,maxOutputTokens:16000,contextTokens:100000,inputMicrosPerMillion:'1000000',outputMicrosPerMillion:'1000000'}]}) });
  assert.match(schema, /^cf_browser_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', MAIL_MODE: 'local', MAIL_LOCAL_DIR: mailbox, RATE_LIMIT_PREFIX: schema, LOG_LEVEL: 'fatal', WEB_ORIGIN: webOrigin });
  mailWorker = startMailWorker(process.env); await mailWorker.worker.waitUntilReady();
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' }); assert.equal(migration.status, 0);
  testDb = new PrismaClient(); dispatcher = startMailDispatcher({ pending: () => testDb.outboxEvent.findMany({ where: { topic: 'identity.email', publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 }), published: (id) => testDb.outboxEvent.update({ where: { id }, data: { publishedAt: new Date() } }) }, process.env);
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js'); app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()).replace('127.0.0.1', 'localhost');
  vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: resolve('apps/web'), env: { ...process.env, QA_SERVER_NONCE: schema, NODE_ENV: 'development', API_PROXY_TARGET: base.replace('localhost', '127.0.0.1'), VITE_API_BASE_URL: `${base}/api/v1` }, stdio: 'ignore', windowsHide: true });
  let started = false; for (let i = 0; i < 100; i++) { if (vite.exitCode !== null) throw new Error('Vite could not start on its isolated test port'); try { const response = await fetch(`http://127.0.0.1:${webPort}`); if (response.ok && response.headers.get('x-contentflow-qa') === schema) { started = true; break; } } catch { /* startup pending */ } await new Promise((r) => setTimeout(r, 100)); } assert.equal(started, true);
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' }); const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message)); const email = `browser-${randomUUID()}@example.invalid`; const password = `browser-only-${randomUUID()}`;
  await check('Vietnamese/English switch and real registration', async () => {
    await page.goto(`${webOrigin}/register`); await page.getByRole('combobox', { name: 'Ngôn ngữ' }).click(); await page.getByRole('option', { name: 'English', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill('Browser QA'); await page.getByLabel('Email address', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.screenshot({ path: resolve(artifacts, 'phase02-auth-dark.png'), fullPage: true }); const registration = page.waitForResponse((response) => response.url().endsWith('/auth/register') && response.request().method() === 'POST'); await page.getByRole('button', { name: 'Create account', exact: true }).click(); assert.equal((await registration).status(), 201, 'Registration API must succeed'); await page.getByRole('status').filter({ hasText: 'an email has been sent' }).waitFor();
  });
  let verification; for (let attempt = 0; attempt < 100 && !verification; attempt++) { for (const file of await readdir(mailbox)) { const message = JSON.parse(await readFile(resolve(mailbox, file), 'utf8')); if (message.to === email && message.text.includes('/verify-email')) verification = message.text.match(/https?:\/\/\S+/)[0]; } if (!verification) await new Promise((r) => setTimeout(r, 50)); } assert.ok(verification);
  await check('email verification, login and empty onboarding with live API', async () => {
    await page.goto(verification); await page.getByRole('button', { name: 'Verify email', exact: true }).waitFor(); assert.equal(await page.evaluate(() => location.hash === '' && typeof history.state?.position === 'number'), true); await page.getByRole('button', { name: 'Verify email', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Email verified' }).waitFor();
    await page.getByRole('link', { name: 'Sign in', exact: true }).click(); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/workspaces'); await page.getByRole('heading', { name: 'Create your first workspace' }).waitFor();
  });
  await check('native dialog focus trap, Escape and focus restoration', async () => {
    const trigger = page.getByRole('button', { name: 'Create workspace' }); await trigger.click(); await page.getByRole('dialog').waitFor();
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement)), true); }
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
  });
  await check('workspace creation, live membership and cookie refresh after reload', async () => {
    await page.getByRole('button', { name: 'Create workspace' }).click(); await page.getByLabel('Workspace name', { exact: true }).fill('Browser verified workspace'); await page.getByRole('dialog').getByRole('button', { name: 'Create workspace' }).click(); await page.waitForURL('**/w/*/settings'); await page.getByRole('heading', { name: 'Browser verified workspace' }).waitFor(); await page.getByText(email, { exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: 'Browser verified workspace' }).waitFor(); await page.screenshot({ path: resolve(artifacts, 'phase03-workspace-dark.png'), fullPage: true });
  });
  await check('two tabs refresh without token replay or unexpected logout', async () => {
    const second = await context.newPage(); const workspaceUrl = page.url();
    try { await Promise.all([page.reload(), second.goto(workspaceUrl)]); await Promise.all([page.getByRole('heading', { name: 'Browser verified workspace' }).waitFor(), second.getByRole('heading', { name: 'Browser verified workspace' }).waitFor()]); assert.equal(await testDb.auditEvent.count({ where: { action: 'identity.refresh_replay' } }), 0); }
    finally { await second.close(); }
  });
  await check('workspace lists load additional cursor pages through the real API', async () => {
    const workspaceUrl = page.url(); const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    await testDb.$transaction(async (tx) => { for (let n = 0; n < 23; n++) await tx.workspace.create({ data: { name: `Pagination fixture ${n}`, slug: randomUUID(), memberships: { create: { userId: user.id, role: 'OWNER' } } } }); });
    await page.goto(`${webOrigin}/workspaces`); await page.getByRole('heading', { name: 'Your workspaces', exact: true }).waitFor();
    await page.locator('#main').getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#main .grid > .card').length === 24);
    await page.goto(workspaceUrl); await page.getByRole('heading', { name: 'Browser verified workspace' }).waitFor();
  });
  await check('Phase 04 brand wizard, persisted edit, private logo and product forms', async () => {
    const workspacePath = new URL(page.url()).pathname.replace(/\/settings$/, '');
    await page.goto(webOrigin + workspacePath + '/brands');
    await page.getByRole('link', { name: /Create$/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Browser brand');
    await page.getByLabel('Industry', { exact: true }).fill('Software');
    await page.getByLabel('Business description', { exact: true }).fill('Verified through the browser');
    await page.getByLabel('Brand colors', { exact: true }).fill('#7856FF\n#112233');
    await page.locator('#main').getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Target audiences', { exact: true }).fill('Marketing teams\nFounders');
    await page.getByLabel('Brand voice', { exact: true }).fill('Clear and friendly');
    await page.locator('#main').getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Languages', { exact: true }).fill('vi\nen');
    await page.locator('#main').getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForURL(/\/brands\/[a-f0-9-]{36}$/); await page.getByRole('heading', { name: 'Browser brand', exact: true }).waitFor();
    const brandUrl = page.url(); await page.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.getByLabel('Industry', { exact: true }).inputValue(), 'Software');
    await page.getByLabel('Name', { exact: true }).fill('Updated browser brand');
    for (let n = 0; n < 3; n++) await page.locator('#main').getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('heading', { name: 'Updated browser brand', exact: true }).waitFor();
    await page.getByLabel('Upload image', { exact: true }).setInputFiles({ name: 'browser-logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('img', { name: 'browser-logo.png', exact: true }).waitFor();
    assert.equal(await page.getByRole('img', { name: 'browser-logo.png' }).evaluate(image => image.complete && image.naturalWidth === 1), true);
    await page.getByRole('button', { name: 'Use as logo', exact: true }).click(); await page.getByRole('button', { name: 'Clear logo', exact: true }).waitFor();
    await page.screenshot({ path: resolve(artifacts, 'phase04-brand-detail.png'), fullPage: true });
    await page.goto(webOrigin + workspacePath + '/products/new');
    await page.getByLabel('Name', { exact: true }).fill('Browser service'); await page.getByLabel('Description', { exact: true }).fill('Browser catalog description');
    await page.getByLabel('Price reference (informational)', { exact: true }).fill('Contact sales');
    await page.getByLabel('Features', { exact: true }).fill('Feature A\nFeature B');
    await page.getByRole('combobox', { name: 'Brand kits', exact: true }).click();
    await page.getByRole('option', { name: 'Updated browser brand', exact: true }).click(); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser service', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Updated browser brand', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByRole('combobox', { name: 'Status', exact: true }).click();
    await page.getByRole('option', { name: 'Archived', exact: true }).click(); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.locator('#main .eyebrow').filter({ hasText: 'Archived' }).waitFor();
    await page.goto(webOrigin + workspacePath + '/products'); await page.getByLabel('Search by name', { exact: true }).fill('no matching item');
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await page.getByText('No matching records. Create a record or change the filters.', { exact: true }).waitFor();
    await page.goto(brandUrl); await page.getByRole('heading', { name: 'Updated browser brand', exact: true }).waitFor();
    for (const width of [768, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    await page.screenshot({ path: resolve(artifacts, 'phase04-brand-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(webOrigin + workspacePath + '/settings');
    await page.getByRole('heading', { name: 'Browser verified workspace', exact: true }).waitFor();
  });
  await check('Phase 05 real credit wallet, exact large integers, ledger/grants/usage and responsive layout', async () => {
    const workspacePath = new URL(page.url()).pathname.replace(/\/settings$/, ''); const workspaceId = workspacePath.split('/').at(-1);
    await page.goto(webOrigin + workspacePath + '/credits'); await page.getByRole('heading', { name: 'Credits & usage', exact: true }).waitFor();
    await page.locator('#main .grid > article').first().getByText('0', { exact: true }).waitFor();
    const { CreditWalletService } = require('../apps/api/dist/credits/credit-wallet.service.js');
    await testDb.$transaction(tx => app.get(CreditWalletService).grant(tx, workspaceId, { source: 'PROMOTIONAL', amount: '9007199254740993', expiresAt: new Date(Date.now()+86400000).toISOString(), reference: 'Isolated browser precision fixture', idempotencyKey: randomUUID() }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.locator('#main .grid > article').first().getByText('9,007,199,254,740,993', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Credit grants', exact: true }).click(); await page.getByRole('cell', { name: 'Promotion', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Credit ledger', exact: true }).click(); await page.getByRole('cell', { name: 'Grant', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'AI usage', exact: true }).click(); await page.getByText('No records yet.', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(artifacts, 'phase05-credits-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(artifacts, 'phase05-credits-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(webOrigin + workspacePath + '/settings'); await page.getByRole('heading', { name: 'Browser verified workspace', exact: true }).waitFor();
  });
  await check('Phase 06 gallery/forms, preview/generate, clipboard, drafts, restore and refund', async () => {
    const workspacePath=new URL(page.url()).pathname.replace(/\/settings$/, ''); const workspaceId=workspacePath.split('/').at(-1); const user=await testDb.user.findUniqueOrThrow({where:{email}}); const brand=await testDb.brand.findFirstOrThrow({where:{workspaceId,deletedAt:null}});
    const operator=await testDb.user.create({data:{email:randomUUID()+'@example.invalid',displayName:'QA operator',emailVerifiedAt:new Date(),systemRole:'SUPER_ADMIN'}});
    const {AiPolicyService}=require('../apps/api/dist/ai/ai-policy.service.js'); const {CatalogService}=require('../apps/api/dist/catalog/catalog.service.js');
    const policy={enabled:true,dailyCapMicros:'5000000',requestsPerMinute:100,maxConcurrent:5}; await app.get(AiPolicyService).configure(operator.id,policy); await app.get(AiPolicyService).configure(operator.id,policy,workspaceId);
    await app.get(CatalogService).saveProduct(workspaceId,user.id,{name:'Active generator product',description:'A supplied product',priceReference:'Contact sales',features:['Known feature'],benefits:['Known benefit'],audiences:['Teams'],categories:[],tags:[],status:'ACTIVE',brandIds:[brand.id]});
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:webOrigin});
    await page.goto(webOrigin+'/app/create?workspaceId='+workspaceId); await page.getByRole('heading',{name:'Create content',exact:true}).waitFor(); await page.locator('.generator-gallery button').first().waitFor(); assert.equal(await page.locator('.generator-gallery button').count(),12);
    await page.getByLabel('Topic',{exact:true}).fill('Sourced product introduction'); await page.getByLabel('Target audiences',{exact:true}).fill('Marketing teams'); await page.getByLabel('Tone',{exact:true}).fill('Warm'); await page.getByLabel('Content objective',{exact:true}).fill('Explain supplied benefits'); await page.getByLabel('Number of variations',{exact:true}).fill('2');
    await page.getByRole('combobox',{name:'Products & services',exact:true}).click(); await page.getByRole('option',{name:'Active generator product',exact:true}).click(); await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Preview credits',exact:true}).click(); await page.locator('#main strong').filter({hasText:'Maximum reservation:'}).waitFor();
    const before=providerCalls; await page.getByRole('button',{name:'Generate content',exact:true}).click(); await page.getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); assert.equal(providerCalls-before,1); const originalRun=page.url();
    await page.getByRole('button',{name:'Copy',exact:true}).first().click(); assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/supplied product facts/);
    await page.getByRole('button',{name:'Save draft',exact:true}).first().click(); await page.getByRole('button',{name:'View saved draft',exact:true}).waitFor();
    await page.reload(); await page.getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); await page.getByRole('button',{name:'View saved draft',exact:true}).click(); await page.getByRole('dialog').getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Regenerate with a new preview',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Generate content',exact:true}).click(); await page.waitForURL(url=>url.toString()!==originalRun); await page.getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); assert.equal(providerCalls-before,2);
    await page.screenshot({path:resolve(artifacts,'phase06-generator-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:1000}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); await page.screenshot({path:resolve(artifacts,'phase06-generator-mobile.png'),fullPage:true}); await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:/^Email Marketing/}).click(); await page.getByLabel('Key message',{exact:true}).fill('A sourced announcement'); await page.getByLabel('Target audiences',{exact:true}).fill('Teams'); await page.getByLabel('Tone',{exact:true}).fill('Warm'); await page.getByLabel('Content objective',{exact:true}).fill('Explain the announcement'); await page.getByRole('button',{name:'Preview credits',exact:true}).click(); await page.getByRole('button',{name:'Generate content',exact:true}).click(); await page.getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); await page.getByText('Product information for your team',{exact:true}).waitFor();
    await page.getByRole('button',{name:/^Facebook Post/}).click(); await page.getByLabel('Topic',{exact:true}).fill('INVALID_OUTPUT'); await page.getByLabel('Target audiences',{exact:true}).fill('Teams'); await page.getByLabel('Tone',{exact:true}).fill('Warm'); await page.getByLabel('Content objective',{exact:true}).fill('Check output handling'); const balanceBefore=(await testDb.creditAccount.findUniqueOrThrow({where:{workspaceId}})).balance;
    await page.getByRole('button',{name:'Preview credits',exact:true}).click(); await page.getByRole('button',{name:'Generate content',exact:true}).click(); await page.getByText('Invalid output — credit refunded',{exact:true}).first().waitFor(); assert.equal((await testDb.creditAccount.findUniqueOrThrow({where:{workspaceId}})).balance,balanceBefore);
    await page.goto(originalRun); await page.getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); await page.goto(webOrigin+workspacePath+'/settings'); await page.getByRole('heading',{name:'Browser verified workspace',exact:true}).waitFor();
  });
  await check('Phase 06 lost-response recovery reuses the same paid operation key', async () => {
    const workspacePath=new URL(page.url()).pathname.replace(/\/settings$/, ''); const workspaceId=workspacePath.split('/').at(-1);
    await page.goto(webOrigin+'/app/create?workspaceId='+workspaceId); await page.getByLabel('Topic',{exact:true}).fill('Recover the original request'); await page.getByLabel('Target audiences',{exact:true}).fill('Teams'); await page.getByLabel('Tone',{exact:true}).fill('Warm'); await page.getByLabel('Content objective',{exact:true}).fill('Explain sourced facts');
    await page.getByRole('button',{name:'Preview credits',exact:true}).click(); await page.getByRole('button',{name:'Generate content',exact:true}).waitFor();
    const before=providerCalls; let dropped=false; const pattern='**/generator/runs'; await page.route(pattern,async route=>{if(route.request().method() !== 'POST' || dropped){await route.continue();return;} dropped=true;await route.fetch();await route.abort('failed');});
    await page.getByRole('button',{name:'Generate content',exact:true}).click(); await page.getByRole('button',{name:'Restore the same request',exact:true}).waitFor(); await page.unrouteAll({behavior:'wait'});
    await page.getByRole('button',{name:'Restore the same request',exact:true}).click(); await page.getByRole('heading',{name:'Fixture draft 1',exact:true}).waitFor(); assert.equal(providerCalls-before,1);
    await page.goto(webOrigin+workspacePath+'/settings'); await page.getByRole('heading',{name:'Browser verified workspace',exact:true}).waitFor();
  });
  await check('theme persistence, tablet/mobile layout and mobile navigation', async () => {
    await page.getByRole('button', { name: 'Switch theme' }).click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'light'); await page.reload(); await page.getByRole('heading', { name: 'Browser verified workspace' }).waitFor(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    for (const width of [1440, 768, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No horizontal overflow at ${width}px`); await page.screenshot({ path: resolve(artifacts, `phase02-light-${width}.png`), fullPage: true }); }
    await page.getByRole('button', { name: 'Navigation', exact: true }).click(); await page.getByRole('dialog').getByRole('link', { name: 'Account settings' }).click(); await page.waitForURL('**/settings'); await page.getByRole('heading', { name: 'Account settings', exact: true }).waitFor();
  });
  await check('profile settings persist through API and logout protects routes', async () => {
    await page.getByLabel('Your name', { exact: true }).fill('Updated browser name'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('Changes saved', { exact: true }).waitFor(); await page.reload(); await page.getByLabel('Your name', { exact: true }).waitFor(); assert.equal(await page.getByLabel('Your name', { exact: true }).inputValue(), 'Updated browser name');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForURL('**/login'); await page.goto(`${webOrigin}/settings`); await page.waitForURL('**/login');
  });
  if (!production) await check('development component showcase and keyboard selection', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${webOrigin}/dev/components`); await page.getByRole('heading', { name: 'Design system', exact: true }).waitFor(); const select = page.getByRole('combobox', { name: 'Choose a theme' }); await select.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); assert.ok((await select.textContent()).includes('Light'));
    await page.screenshot({ path: resolve(artifacts, 'phase02-components.png'), fullPage: true });
  });
  assert.deepEqual(errors, []); console.log(`Browser QA: ${passed} scenarios passed; screenshots saved under .local/qa`);
} finally {
  if (browser) await browser.close(); if (vite) { vite.kill(); await new Promise((r) => { if (vite.exitCode !== null) r(); else vite.once('exit', r); }); } if (app && testDb) { const { StorageService } = require('../apps/api/dist/platform/storage.service.js'); for (const asset of await testDb.catalogAsset.findMany()) await app.get(StorageService).remove(asset.storageKey); } if (app) await app.close(); if (dispatcher) await dispatcher.close(); if (mailWorker) await mailWorker.close(); if (testDb) await testDb.$disconnect(); if (providerFixture) { await new Promise(resolve=>providerFixture.close(resolve)); providerFixture.closeAllConnections(); }
  if (/^cf_browser_[a-f0-9]{32}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); assert.equal(mailbox, resolve('.local', schema)); await rm(mailbox, { recursive: true, force: true });
}
