import 'reflect-metadata';
import { config } from 'dotenv'; import { createRequire } from 'node:module'; import { randomUUID, randomBytes, createHash } from 'node:crypto'; import { spawnSync } from 'node:child_process'; import { createServer } from 'node:http'; import assert from 'node:assert/strict';
config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost','127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Finance QA requires explicitly local PostgreSQL');
const schema = `cf_finance_${randomUUID().replaceAll('-','')}`; const database = new URL(original); database.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: original } } }); let db; let app; let passed = 0; const requests = [];
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=';
// Protocol fixtures exist only in this isolated test harness, never in application adapters.
const provider = createServer(async (req, res) => {
  if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"data":[]}'); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks));
  const prompt = req.url.includes('/images/') ? body.prompt : body.messages[0].content; const request = JSON.parse(prompt).request;
  requests.push({ request, body, id: req.headers['x-client-request-id'] });
  if (request === 'REJECT') { res.writeHead(400); res.end('{}'); return; }
  if (request === 'SERVER_ERROR') { res.writeHead(500); res.end('{}'); return; }
  if (['TIMEOUT','CANCEL'].includes(request)) await new Promise(r => setTimeout(r, 700));
  if (request === 'SLOW') await new Promise(r => setTimeout(r, 100));
  if (res.destroyed) return;
  res.writeHead(200, { 'Content-Type': 'application/json', 'x-request-id': `fixture-${randomUUID()}` });
  if (req.url === '/v1/images/generations') res.end(JSON.stringify({ data: [{ b64_json: png }] }));
  else if (request === 'MISSING_USAGE') res.end(JSON.stringify({ id: randomUUID(), model: body.model, choices: [{ message: { content: 'fixture-only' } }] }));
  else res.end(JSON.stringify({ id: randomUUID(), model: body.model, choices: [{ message: { content: 'fixture-only' } }], usage: { prompt_tokens: request === 'BREACH' ? 999999 : 10, completion_tokens: 5 } }));
});
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const digest = value => createHash('sha256').update(value).digest('hex');
try {
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const model = { id: 'fixture-text', provider: 'fixture', model: 'fixture-text-model', priceVersion: 'test-price-v1', capability: 'TEXT', tasks: ['TEXT_GENERATION','SUMMARIZE','TRANSLATE'], maxInputTokens: 4096, maxOutputTokens: 64, contextTokens: 8192, inputMicrosPerMillion: '1000000', outputMicrosPerMillion: '1000000' };
  const routing = { providers: [{ id: 'fixture', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, keyEnv: 'AI_SECRET_FINANCE_FIXTURE' }], models: [model, { ...model, id: 'fixture-image', model: 'fixed-price-image-fixture', capability: 'IMAGE_FIXED_PRICE', tasks: ['IMAGE_GENERATION'], imagePriceMicros: '100' }] };
  assert.match(schema, /^cf_finance_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: database.toString(), NODE_ENV: 'test', LOG_LEVEL: 'fatal', RATE_LIMIT_PREFIX: schema, AI_ENABLED: 'true', AI_ROUTING_CONFIG: JSON.stringify(routing), AI_SECRET_FINANCE_FIXTURE: randomBytes(32).toString('hex'), AI_TIMEOUT_MS: '250', AI_CREDIT_MICROS_PER_ATOM: '1' });
  for (let i = 0; i < 2; i++) { const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy','--schema','apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr || migration.stdout); }
  db = new PrismaClient();
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js'); const { CreditWalletService } = require('../apps/api/dist/credits/credit-wallet.service.js'); const { AiGatewayService } = require('../apps/api/dist/ai/ai-gateway.service.js');
  app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1');
  const wallet = app.get(CreditWalletService); const gateway = app.get(AiGatewayService); const base = `${await app.getUrl()}/api/v1`;
  const transaction = fn => db.$transaction(fn, { maxWait: 15000, timeout: 15000 });
  async function actor(systemRole = 'USER') {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Finance fixture', systemRole, emailVerifiedAt: new Date() } });
    const token = randomBytes(32).toString('base64url'); await db.session.create({ data: { userId: user.id, familyId: randomUUID(), refreshTokenHash: digest(randomUUID()), accessTokenHash: digest(token), expiresAt: new Date(Date.now()+3600000), accessExpiresAt: new Date(Date.now()+3600000) } }); return { id: user.id, token };
  }
  const owner = await actor(); const superAdmin = await actor('SUPER_ADMIN'); const viewer = await actor(); const outsider = await actor();
  async function workspace() { return db.workspace.create({ data: { name: 'Finance QA', slug: randomUUID(), memberships: { create: { userId: owner.id, role: 'OWNER' } } } }); }
  const w = await workspace(); const primitives = await workspace();
  await db.membership.create({ data: { workspaceId: w.id, userId: viewer.id, role: 'VIEWER' } });
  async function call(path, method = 'GET', body, token = owner.token) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json(); return { status: response.status, ...result };
  }
  const cpath = (id = w.id) => `/workspaces/${id}/credits`;
  const apath = (id = w.id) => `/admin/workspaces/${id}/credits`;
  const policy = { enabled: true, dailyCapMicros: '1000000', requestsPerMinute: 1000, maxConcurrent: 20 };
  async function policies(id) { assert.equal((await call('/admin/ai/policy', 'PUT', policy, superAdmin.token)).status, 200); assert.equal((await call(`/admin/workspaces/${id}/ai/policy`, 'PUT', policy, superAdmin.token)).status, 200); }
  async function grant(id, amount = '100000', extra = {}) { const dto = { source: 'PURCHASE', amount, reference: `test-source-${randomUUID()}`, idempotencyKey: randomUUID(), reason: 'Isolated finance QA grant', ...extra }; const r = await call(`${apath(id)}/grants`, 'POST', dto, superAdmin.token); assert.equal(r.status, 201, JSON.stringify(r.error)); return { ...r.data, dto }; }
  const input = (prompt = 'OK', key = randomUUID()) => ({ taskType: 'TEXT_GENERATION', prompt, idempotencyKey: key });
  const status = error => error.getStatus?.();
  await check('wallet starts empty, serializes decimal strings and denies tenant access', async () => {
    const balance = await call(`${cpath()}/balance`); assert.equal(balance.status, 200, JSON.stringify(balance)); assert.equal(balance.data.available, '0');
    for (const path of ['/balance','/ledger','/grants']) assert.equal((await call(`${cpath()}${path}`, 'GET', undefined, outsider.token)).status, 404);
    assert.equal((await call(`${cpath()}/balance`, 'GET', undefined, '')).status, 401);
    assert.equal((await call(`${apath()}/grants`, 'POST', {}, owner.token)).status, 403);
  });
  await check('verified admin grants are idempotent; DTO rejects numbers, balances and negative credits', async () => {
    const first = await grant(primitives.id, '100');
    assert.equal((await call(`${apath(primitives.id)}/grants`, 'POST', first.dto, superAdmin.token)).data.id, first.id);
    assert.equal((await call(`${apath(primitives.id)}/grants`, 'POST', { ...first.dto, amount: '101' }, superAdmin.token)).status, 409);
    assert.equal((await call(`${apath(primitives.id)}/grants`, 'POST', { ...first.dto, idempotencyKey: randomUUID() }, superAdmin.token)).status, 409);
    for (const invalid of [{ ...first.dto, amount: 10 }, { ...first.dto, amount: '-10' }, { ...first.dto, balance: '9000' }]) assert.equal((await call(`${apath()}/grants`, 'POST', invalid, superAdmin.token)).status, 400);
    assert.equal((await call(`${cpath(primitives.id)}/balance`)).data.balance, '100');
  });
  let reserved;
  await check('20 concurrent reservations cannot double-spend five available allocations', async () => {
    const generations = await Promise.all(Array.from({ length: 20 }, () => db.aiGeneration.create({ data: { workspaceId: primitives.id, idempotencyKey: randomUUID(), provider: 'wallet-fixture', model: 'primitive-only', input: {}, status: 'FAILED' } })));
    const results = await Promise.allSettled(generations.map(g => transaction(tx => wallet.reserve(tx, primitives.id, g.id, 20n))));
    reserved = results.filter(r => r.status === 'fulfilled').map(r => r.value); assert.equal(reserved.length, 5);
    for (const r of results.filter(r => r.status === 'rejected')) assert.equal(status(r.reason), 402);
    const balance = (await call(`${cpath(primitives.id)}/balance`)).data; assert.equal(balance.available, '0'); assert.equal(balance.reserved, '100');
    assert.equal((await call(`${apath(primitives.id)}/adjustments`, 'POST', { amount: '-1', idempotencyKey: randomUUID(), reason: 'Must not consume held credits' }, superAdmin.token)).status, 402);
  });
  await check('concurrent repeated settlement charges once and releases unused reservation', async () => {
    const r = reserved[0]; await Promise.all(Array.from({ length: 5 }, () => transaction(tx => wallet.settle(tx, primitives.id, r.generationId, 7n))));
    assert.equal(await db.creditLedgerEntry.count({ where: { workspaceId: primitives.id, kind: 'USAGE' } }), 1);
    assert.equal((await call(`${cpath(primitives.id)}/balance`)).data.balance, '93');
    await assert.rejects(transaction(tx => wallet.settle(tx, primitives.id, r.generationId, 8n)), error => status(error) === 409);
    for (const hold of reserved.slice(1)) { await transaction(tx => wallet.release(tx, primitives.id, hold.generationId)); await transaction(tx => wallet.release(tx, primitives.id, hold.generationId)); }
    assert.equal((await call(`${cpath(primitives.id)}/balance`)).data.reserved, '0');
  });
  await check('concurrent refunds compensate once and ledger/lot origins reject mutations', async () => {
    await Promise.all(Array.from({ length: 4 }, () => transaction(tx => wallet.refund(tx, primitives.id, reserved[0].generationId))));
    assert.equal((await call(`${cpath(primitives.id)}/balance`)).data.balance, '100');
    assert.equal(await db.creditLedgerEntry.count({ where: { workspaceId: primitives.id, kind: 'REFUND' } }), 1);
    const entry = await db.creditLedgerEntry.findFirstOrThrow({ where: { workspaceId: primitives.id } });
    await assert.rejects(db.creditLedgerEntry.update({ where: { id: entry.id }, data: { amount: 999n } }));
    await assert.rejects(db.creditLedgerEntry.delete({ where: { id: entry.id } }));
    const lot = await db.creditGrant.findFirstOrThrow({ where: { workspaceId: primitives.id } });
    await assert.rejects(db.creditGrant.update({ where: { id: lot.id }, data: { expiresAt: new Date() } }));
    await assert.rejects(db.creditAccount.update({ where: { workspaceId: primitives.id }, data: { balance: 999n } }));
    assert.equal((await call(`${apath(primitives.id)}/reconcile`, 'POST', undefined, superAdmin.token)).data.consistent, true);
  });
  await check('grant expiry keeps held funds pinned; expired refunds cannot resurrect spendable credits', async () => {
    const expiring = await workspace(); const expiry = new Date(Date.now()+1200).toISOString();
    await grant(expiring.id, '50', { source: 'SUBSCRIPTION', expiresAt: expiry }); await grant(expiring.id, '30');
    const generation = await db.aiGeneration.create({ data: { workspaceId: expiring.id, idempotencyKey: randomUUID(), provider: 'wallet-fixture', model: 'primitive-only', input: {}, status: 'FAILED' } });
    await transaction(tx => wallet.reserve(tx, expiring.id, generation.id, 70n));
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal((await call(`${cpath(expiring.id)}/balance`)).data.available, '10');
    await transaction(tx => wallet.settle(tx, expiring.id, generation.id, 20n));
    assert.equal((await call(`${cpath(expiring.id)}/balance`)).data.available, '30');
    await transaction(tx => wallet.refund(tx, expiring.id, generation.id));
    assert.equal((await call(`${cpath(expiring.id)}/balance`)).data.available, '30');
    assert.equal((await call(`${apath(expiring.id)}/reconcile`, 'POST', undefined, superAdmin.token)).data.consistent, true);
  });
  await check('financial amounts above Number.MAX_SAFE_INTEGER remain exact decimal strings', async () => {
    const large = await workspace(); await grant(large.id, '9007199254740993', { source: 'PROMOTIONAL', expiresAt: new Date(Date.now()+86400000).toISOString() });
    assert.equal((await call(`${cpath(large.id)}/balance`)).data.available, '9007199254740993');
  });
  await policies(w.id);
  await check('insufficient balance and viewer/foreign access never invoke generation provider', async () => {
    const before = requests.length;
    await assert.rejects(gateway.generate(w.id, owner.id, input()), error => status(error) === 402);
    await assert.rejects(gateway.generate(w.id, viewer.id, input()), error => status(error) === 403);
    await assert.rejects(gateway.generate(w.id, outsider.id, input()), error => status(error) === 404);
    const disabled = await actor(); await db.membership.create({ data: { workspaceId: w.id, userId: disabled.id, role: 'EDITOR' } });
    await db.user.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
    await assert.rejects(gateway.generate(w.id, disabled.id, input()), error => status(error) === 403);
    assert.equal(requests.length, before); assert.equal(await db.aiGeneration.count({ where: { workspaceId: w.id } }), 0);
  });
  await grant(w.id, '100000');
  await check('server estimate rejects client pricing and enforces limits and tenant brand context', async () => {
    const estimate = await call(`/workspaces/${w.id}/ai/estimate`, 'POST', { taskType: 'TEXT_GENERATION', prompt: 'OK' }); assert.equal(estimate.data.worstCredits, '4160');
    assert.equal((await call(`/workspaces/${w.id}/ai/estimate`, 'POST', { taskType: 'TEXT_GENERATION', prompt: 'OK', costMicros: '0' })).status, 400);
    await assert.rejects(gateway.generate(w.id, owner.id, { ...input(), maxOutputTokens: 65 }), error => status(error) === 400);
    await assert.rejects(gateway.generate(w.id, owner.id, input('x'.repeat(5000))), error => status(error) === 400);
    const foreignBrand = await db.brand.create({ data: { workspaceId: primitives.id, name: 'Other brand context' } });
    await assert.rejects(gateway.generate(w.id, owner.id, { ...input(), brandId: foreignBrand.id }), error => status(error) === 404);
  });
  let completed;
  await check('concurrent duplicate generation invokes provider and settles exactly once', async () => {
    const operation = input('SLOW'); const before = requests.length;
    const results = await Promise.all(Array.from({ length: 8 }, () => gateway.generate(w.id, owner.id, operation)));
    assert.equal(new Set(results.map(r => r.id)).size, 1); assert.equal(requests.length-before, 1);
    completed = await gateway.generate(w.id, owner.id, operation); assert.equal(completed.status, 'SUCCEEDED');
    const usage = await db.aiUsage.findUniqueOrThrow({ where: { generationId: completed.id } }); assert.equal(usage.costMicros, 15n); assert.equal(usage.credits, 15n);
    assert.equal((await call(`${cpath()}/balance`)).data.available, '99985');
    await assert.rejects(gateway.generate(w.id, owner.id, { ...operation, prompt: 'different' }), error => status(error) === 409);
    const sent = requests.at(-1).body; assert.equal(sent.max_completion_tokens, 64); assert.equal(sent.store, false); assert.equal(sent.n, 1);
  });
  await check('definitive provider rejection releases funds without usage charge', async () => {
    const before = (await call(`${cpath()}/balance`)).data;
    const result = await gateway.generate(w.id, owner.id, input('REJECT')); assert.equal(result.status, 'FAILED');
    const after = (await call(`${cpath()}/balance`)).data; assert.equal(after.available, before.available); assert.equal(after.reserved, '0');
    assert.equal(await db.aiUsage.count({ where: { generationId: result.id } }), 0);
  });
  let uncertain;
  await check('timeout holds worst-case funds/caps and retry never sends a second provider request', async () => {
    const operation = input('TIMEOUT'); const before = requests.length; uncertain = await gateway.generate(w.id, owner.id, operation);
    assert.equal(uncertain.status, 'UNKNOWN'); assert.equal((await call(`${cpath()}/balance`)).data.reserved, '4160');
    assert.equal((await gateway.generate(w.id, owner.id, operation)).id, uncertain.id); assert.equal(requests.length-before, 1);
    assert.equal((await db.aiSpendBucket.findFirstOrThrow({ where: { scope: `workspace:${w.id}` } })).reservedMicros, 4160n);
    const denied = await call(`/admin/workspaces/${w.id}/ai/reconcile/${uncertain.id}`, 'POST', { outcome: 'UNBILLED', evidence: 'Fixture confirmed no billing' }, owner.token); assert.equal(denied.status, 403);
  });
  await check('audited uncertain reconciliation is idempotent, calculates cost on server and releases remainder', async () => {
    const dto = { outcome: 'BILLED', inputTokens: 10, outputTokens: 5, evidence: 'Trusted fixture usage receipt reviewed' };
    const path = `/admin/workspaces/${w.id}/ai/reconcile/${uncertain.id}`;
    assert.equal((await call(path, 'POST', { ...dto, inputTokens: 999999 }, superAdmin.token)).status, 409);
    assert.equal((await call(`${cpath()}/balance`)).data.reserved, '4160');
    assert.equal((await call(path, 'POST', dto, superAdmin.token)).status, 201); assert.equal((await call(path, 'POST', dto, superAdmin.token)).status, 201);
    assert.equal(await db.aiUsage.count({ where: { generationId: uncertain.id } }), 1); assert.equal((await call(`${cpath()}/balance`)).data.reserved, '0');
    assert.equal((await call(path, 'POST', { ...dto, outcome: 'UNBILLED', inputTokens: undefined, outputTokens: undefined }, superAdmin.token)).status, 409);
  });
  await check('ambiguous server errors and malformed success usage retain holds until proven unbilled', async () => {
    for (const prompt of ['SERVER_ERROR','MISSING_USAGE']) {
      const result = await gateway.generate(w.id, owner.id, input(prompt)); assert.equal(result.status, 'UNKNOWN');
      assert.equal((await call(`/admin/workspaces/${w.id}/ai/reconcile/${result.id}`, 'POST', { outcome: 'UNBILLED', evidence: 'Fixture operator verified zero provider billing' }, superAdmin.token)).status, 201);
    }
    assert.equal((await call(`${cpath()}/balance`)).data.reserved, '0');
  });
  await check('cancellation after dispatch retains reservation and never implies a provider refund', async () => {
    const abort = new AbortController(); const operation = input('CANCEL'); const before = requests.length;
    const running = gateway.generate(w.id, owner.id, operation, abort.signal);
    while (requests.length === before) await new Promise(resolve => setTimeout(resolve, 5)); abort.abort();
    const result = await running; assert.equal(result.status, 'UNKNOWN');
    assert.equal((await call(`${cpath()}/balance`)).data.reserved, '4160');
    await gateway.resolve(w.id, superAdmin.id, result.id, { outcome: 'UNBILLED', evidence: 'Fixture cancellation receipt confirmed unbilled' });
    const early = new AbortController(); early.abort(); const count = requests.length;
    await assert.rejects(gateway.generate(w.id, owner.id, input(), early.signal)); assert.equal(requests.length, count);
  });
  await check('daily spend cap and kill switch reject new calls before provider dispatch', async () => {
    let count = requests.length;
    assert.equal((await call(`/admin/workspaces/${w.id}/ai/policy`, 'PUT', { ...policy, dailyCapMicros: '1' }, superAdmin.token)).status, 200);
    await assert.rejects(gateway.generate(w.id, owner.id, input()), error => status(error) === 409); assert.equal(requests.length, count);
    await policies(w.id); await call('/admin/ai/policy', 'PUT', { ...policy, enabled: false }, superAdmin.token);
    await assert.rejects(gateway.generate(w.id, owner.id, input()), error => status(error) === 409); assert.equal(requests.length, count); await policies(w.id);
  });
  await check('workspace quota and concurrency bounds are atomic across requests', async () => {
    await call(`/admin/workspaces/${w.id}/ai/policy`, 'PUT', { ...policy, maxConcurrent: 1 }, superAdmin.token);
    const before = requests.length; const running = gateway.generate(w.id, owner.id, input('TIMEOUT'));
    while (requests.length === before) await new Promise(resolve => setTimeout(resolve, 5));
    await assert.rejects(gateway.generate(w.id, owner.id, input()), error => status(error) === 429);
    const result = await running; await gateway.resolve(w.id, superAdmin.id, result.id, { outcome: 'UNBILLED', evidence: 'Fixture operator verified timeout not billed' });
    await call(`/admin/workspaces/${w.id}/ai/policy`, 'PUT', { ...policy, requestsPerMinute: 1 }, superAdmin.token);
    await assert.rejects(gateway.generate(w.id, owner.id, input()), error => status(error) === 429); await policies(w.id);
  });
  await check('fixed-price image capability is bounded and reconciled without client costs', async () => {
    const result = await gateway.generate(w.id, owner.id, { taskType: 'IMAGE_GENERATION', prompt: 'IMAGE', idempotencyKey: randomUUID() }); assert.equal(result.status, 'SUCCEEDED');
    const usage = await db.aiUsage.findUniqueOrThrow({ where: { generationId: result.id } }); assert.equal(usage.costMicros, 100n);
    const sent = requests.at(-1).body; assert.equal(sent.n, 1); assert.equal(sent.size, '1024x1024'); assert.equal(sent.quality, 'low');
  });
  await check('out-of-bound usage never overcharges and disables new admissions for investigation', async () => {
    const before = (await call(`${cpath()}/balance`)).data.balance; const result = await gateway.generate(w.id, owner.id, input('BREACH')); assert.equal(result.status, 'UNKNOWN');
    assert.equal((await call(`${cpath()}/balance`)).data.balance, before); assert.equal((await db.aiPolicy.findUniqueOrThrow({ where: { key: 'global' } })).enabled, false);
    await gateway.resolve(w.id, superAdmin.id, result.id, { outcome: 'UNBILLED', evidence: 'Fixture provider usage was invalid and not billed' }); await policies(w.id);
  });
  await check('admin adjustments/refunds are audited, scoped and cannot consume held funds', async () => {
    const key = randomUUID(); const dto = { amount: '-7', idempotencyKey: key, reason: 'Operator QA correction with receipt' };
    assert.equal((await call(`${apath()}/adjustments`, 'POST', dto, superAdmin.token)).status, 201); assert.equal((await call(`${apath()}/adjustments`, 'POST', dto, superAdmin.token)).status, 201);
    assert.equal((await call(`${apath()}/adjustments`, 'POST', { ...dto, amount: '7' }, superAdmin.token)).status, 409);
    assert.equal((await call(`${apath()}/refunds/${completed.id}`, 'POST', { evidence: 'Operator QA refund with verified receipt' }, superAdmin.token)).status, 201);
    assert.equal((await call(`${apath(primitives.id)}/refunds/${completed.id}`, 'POST', { evidence: 'Attempt foreign generation refund' }, superAdmin.token)).status, 409);
    assert.ok(await db.auditEvent.count({ where: { workspaceId: w.id, action: 'credits.adjusted' } }));
    assert.equal((await call(`${apath()}/reconcile`, 'POST', undefined, superAdmin.token)).data.consistent, true);
  });
  await check('ledger pagination, usage history privacy and cross-workspace isolation', async () => {
    const first = await call(`${cpath()}/ledger?limit=2`); assert.ok(first.data.nextCursor);
    const next = await call(`${cpath()}/ledger?limit=2&cursor=${first.data.nextCursor}`); assert.notEqual(next.data.items[0].id, first.data.items[0].id);
    assert.equal((await call(`${cpath(primitives.id)}/ledger?cursor=${first.data.nextCursor}`)).status, 400);
    const history = await call(`/workspaces/${w.id}/ai/usage`); assert.equal(history.status, 200); assert.ok(!JSON.stringify(history.data).includes('fixture-only')); assert.ok(!JSON.stringify(history.data).includes('requestHash'));
    assert.equal((await call(`/workspaces/${w.id}/ai/usage`, 'GET', undefined, outsider.token)).status, 404);
  });
  await check('crash recovery releases only undispatched intents; unknown holds survive lease expiry and reconcile to original UTC day', async () => {
    const crashed = await workspace(); await policies(crashed.id); await grant(crashed.id, '10000');
    const { AiPolicyService } = require('../apps/api/dist/ai/ai-policy.service.js'); const { WorkspaceService } = require('../apps/api/dist/workspaces/workspace.service.js');
    const policyService = app.get(AiPolicyService); const workspaces = app.get(WorkspaceService);
    const yesterday = new Date(new Date().toISOString().slice(0,10) + 'T00:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate()-1);
    async function interrupted(state, historical = false) {
      return transaction(async tx => {
        await policyService.globalLock(tx); await workspaces.lockForAccounting(tx, crashed.id);
        let day = await policyService.admission(tx, crashed.id, 4160n);
        if (historical) {
          for (const scope of ['global', 'workspace:' + crashed.id]) {
            await tx.aiSpendBucket.update({ where: { scope_day: { scope, day } }, data: { reservedMicros: { decrement: 4160n } } });
            await tx.aiSpendBucket.upsert({ where: { scope_day: { scope, day: yesterday } }, create: { scope, day: yesterday, reservedMicros: 4160n }, update: { reservedMicros: { increment: 4160n } } });
          } day = yesterday;
        }
        const generation = await tx.aiGeneration.create({ data: { workspaceId: crashed.id, idempotencyKey: randomUUID(), fingerprint: digest(randomUUID()), provider: 'fixture', model: model.model, taskType: 'TEXT_GENERATION', pricing: { route: { ...model, imagePriceMicros: '0' }, maxOutputTokens: 64, creditMicrosPerAtom: '1' }, input: {}, status: state, estimatedMicros: 4160n, spendDay: day, dispatchedAt: state === 'RUNNING' ? new Date(Date.now()-600000) : null, deadlineAt: new Date(Date.now()-600000) } });
        await wallet.reserve(tx, crashed.id, generation.id, 4160n); return generation;
      });
    }
    const queued = await interrupted('QUEUED'); const dispatched = await interrupted('RUNNING', true); const calls = requests.length;
    await gateway.recover(); await gateway.recover(); assert.equal(requests.length, calls);
    assert.equal((await db.aiGeneration.findUniqueOrThrow({ where: { id: queued.id } })).status, 'CANCELLED');
    assert.equal((await db.aiGeneration.findUniqueOrThrow({ where: { id: dispatched.id } })).status, 'UNKNOWN');
    assert.equal((await call(cpath(crashed.id) + '/balance')).data.reserved, '4160');
    await assert.rejects(db.aiGeneration.update({ where: { id: dispatched.id }, data: { estimatedMicros: 1n } }));
    await gateway.resolve(crashed.id, superAdmin.id, dispatched.id, { outcome: 'BILLED', inputTokens: 10, outputTokens: 5, evidence: 'Historical provider receipt verified by operator' });
    const originalDay = await db.aiSpendBucket.findUniqueOrThrow({ where: { scope_day: { scope: 'workspace:' + crashed.id, day: yesterday } } });
    assert.equal(originalDay.spentMicros, 15n); assert.equal(originalDay.reservedMicros, 0n);
    assert.equal((await call(cpath(crashed.id) + '/balance')).data.reserved, '0');
    assert.equal((await call(apath(crashed.id) + '/reconcile', 'POST', undefined, superAdmin.token)).data.consistent, true);
  });
  await check('provider health monitoring uses non-generating probes', async () => {
    const before = requests.length; const health = await call('/admin/ai/providers', 'GET', undefined, superAdmin.token); assert.equal(health.status, 200); assert.equal(health.data.providers[0].healthy, true); assert.equal(requests.length, before);
  });
  console.log(`Finance/gateway QA: ${passed} scenarios passed with real PostgreSQL and HTTP protocol fixtures (no live paid provider calls).`);
} finally {
  if (app) await app.close(); if (db) await db.$disconnect();
  await new Promise(resolve => provider.close(resolve)); provider.closeAllConnections();
  if (/^cf_finance_[a-f0-9]{32}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
}
