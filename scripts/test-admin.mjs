import 'reflect-metadata';
import { config } from 'dotenv';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost', '127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Admin tests require local PostgreSQL');
const schema = `cf_admin_${randomUUID().replaceAll('-', '')}`; const url = new URL(original); url.searchParams.set('schema', schema);
const adminDb = new PrismaClient({ datasources: { db: { url: original } } }); let db; let app; let passed = 0;
const digest = value => createHash('sha256').update(value).digest('hex');
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
try {
  assert.match(schema, /^cf_admin_[a-f0-9]{32}$/); await adminDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', LOG_LEVEL: 'fatal', RATE_LIMIT_PREFIX: schema });
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  db = new PrismaClient(); const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js');
  app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/api/v1`;
  async function actor(systemRole = 'USER') { const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Admin QA', emailVerifiedAt: new Date(), systemRole } }); const token = randomBytes(32).toString('base64url'); await db.session.create({ data: { userId: user.id, familyId: randomUUID(), refreshTokenHash: digest(randomUUID()), accessTokenHash: digest(token), expiresAt: new Date(Date.now()+600000), accessExpiresAt: new Date(Date.now()+600000) } }); return { id: user.id, token }; }
  async function call(path, method = 'GET', body, actor) { const response = await fetch(`${base}${path}`, { method, headers: { ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, ...await response.json() }; }
  const admin = await actor('SUPER_ADMIN'); const user = await actor();
  const workspace = await db.workspace.create({ data: { name: 'Admin QA', slug: randomUUID(), memberships: { create: { userId: user.id, role: 'OWNER' } } } });
  await check('admin endpoints deny ordinary users and anonymous requests', async () => {
    for (const path of ['/admin/overview', '/admin/users', '/admin/ai/usage', '/admin/ai/policy']) { assert.equal((await call(path, 'GET', undefined, user)).status, 403); assert.equal((await call(path)).status, 401); }
    assert.equal((await call(`/admin/users/${user.id}/status`, 'PATCH', { action: 'suspend', reason: 'A documented security incident' }, user)).status, 403);
  });
  await check('overview metrics and sparse trends reflect actual rows', async () => {
    const empty = (await call('/admin/overview', 'GET', undefined, admin)).data; assert.equal(empty.totals.totalUsers, 2); assert.equal(empty.totals.activeUsers, 2); assert.equal(empty.totals.aiRequests, 0); assert.deepEqual(empty.charts.usageTrend, []); assert.equal(empty.queue.reachable, true);
    const plan = await db.plan.create({ data: { code: 'PRO_MONTHLY_V1', name: 'Pro QA', monthlyCredits: 0n, priceMinor: 1299n, currency: 'USD', tier: 'PRO', active: true } });
    await db.subscription.create({ data: { workspaceId: workspace.id, planId: plan.id, provider: 'qa', externalId: randomUUID(), status: 'ACTIVE' } });
    await db.mediaAsset.create({ data: { workspaceId: workspace.id, storageKey: `qa/${randomUUID()}`, originalName: 'qa.png', mimeType: 'image/png', size: 100, thumbnailSize: 20, width: 2, height: 2, status: 'READY' } });
    const brand = await db.brand.create({ data: { workspaceId: workspace.id, name: 'QA brand' } });
    await db.catalogAsset.create({ data: { workspaceId: workspace.id, brandId: brand.id, storageKey: `qa/${randomUUID()}`, originalName: 'logo.png', mimeType: 'image/png', size: 40, status: 'READY' } });
    const generation = await db.aiGeneration.create({ data: { workspaceId: workspace.id, idempotencyKey: randomUUID(), provider: 'qa-provider', model: 'qa-model', status: 'FAILED', input: {}, errorCode: 'QA_ERROR' } });
    await db.aiUsage.create({ data: { workspaceId: workspace.id, generationId: generation.id, inputTokens: 10, outputTokens: 2, costMicros: 130n, credits: 7n } });
    const result = (await call('/admin/overview', 'GET', undefined, admin)).data; assert.equal(result.totals.aiRequests, 1); assert.equal(result.totals.creditUsage, '7'); assert.equal(result.totals.providerCostMicros, '130'); assert.equal(result.totals.errorRate, 1); assert.equal(result.totals.paidCustomers, 1); assert.equal(result.totals.subscriptions, 1); assert.equal(result.totals.storageUsageBytes, '160'); assert.equal(result.charts.plans[0].plan.name, 'Pro QA'); assert.equal(result.charts.providerBreakdown[0].provider, 'qa-provider'); assert.equal(result.charts.usageTrend[0].cost, '130'); assert.equal(result.charts.generationTrend[0].status, 'FAILED');
  });
  await check('user filters, detail and AI log filters exclude private payloads', async () => {
    const list = await call(`/admin/users?search=${encodeURIComponent(user.id.slice(0, 5))}`, 'GET', undefined, admin); assert.equal(list.status, 200); assert.equal(list.data.items.length, 0);
    const all = await call('/admin/users?status=active', 'GET', undefined, admin); assert.equal(all.data.items.length, 2);
    const detail = (await call(`/admin/users/${user.id}`, 'GET', undefined, admin)).data; assert.equal(detail.memberships[0].workspaceId, workspace.id); assert.equal(detail.workspaceUsage.credits, '7'); assert.ok(!JSON.stringify(detail).includes('refreshTokenHash'));
    const usage = await call('/admin/ai/usage?provider=qa-provider&status=FAILED', 'GET', undefined, admin); assert.equal(usage.data.items.length, 1); assert.ok(!JSON.stringify(usage).includes('"input":'));
    assert.equal((await call('/admin/ai/usage?status=SUCCEEDED', 'GET', undefined, admin)).data.items.length, 0);
  });
  await check('suspension revokes sessions and writes audit; restore cannot self-target admin', async () => {
    const path = `/admin/users/${user.id}/status`; const reason = 'Verified policy violation case QA-001';
    assert.equal((await call(path, 'PATCH', { action: 'suspend', reason: 'short' }, admin)).status, 400);
    assert.equal((await call(path, 'PATCH', { action: 'suspend', reason }, admin)).status, 200);
    assert.equal((await call('/users/me', 'GET', undefined, user)).status, 401);
    assert.equal((await call('/admin/users?status=suspended', 'GET', undefined, admin)).data.items.length, 1);
    assert.equal((await call(`/admin/users/${admin.id}/status`, 'PATCH', { action: 'suspend', reason }, admin)).status, 403);
    assert.equal((await call(path, 'PATCH', { action: 'restore', reason }, admin)).status, 200);
    assert.equal((await call('/admin/users?status=suspended', 'GET', undefined, admin)).data.items.length, 0);
    assert.equal(await db.auditEvent.count({ where: { entityType: 'user', entityId: user.id, action: { in: ['admin.user_suspended', 'admin.user_restored'] } } }), 2);
  });
  await check('global AI policy is admin-only and auditable', async () => {
    const policy = { enabled: false, dailyCapMicros: '5000', requestsPerMinute: 6, maxConcurrent: 2 };
    const ordinary = await actor(); assert.equal((await call('/admin/ai/policy', 'PUT', policy, ordinary)).status, 403);
    assert.equal((await call('/admin/ai/policy', 'PUT', policy, admin)).status, 200);
    const read = (await call('/admin/ai/policy', 'GET', undefined, admin)).data; assert.equal(read.dailyCapMicros, '5000'); assert.equal(read.enabled, false);
    assert.ok(await db.auditEvent.count({ where: { action: 'ai.policy_changed' } }));
  });
  console.log(`Admin integration: ${passed} scenarios passed`);
} finally {
  if (app) await app.close(); if (db) await db.$disconnect();
  if (/^cf_admin_[a-f0-9]{32}$/.test(schema)) await adminDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminDb.$disconnect();
}
