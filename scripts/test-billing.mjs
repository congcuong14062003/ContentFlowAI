import 'reflect-metadata';
import { config } from 'dotenv';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost', '127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Billing tests require local PostgreSQL');
const schema = `cf_billing_${randomUUID().replaceAll('-', '')}`; const url = new URL(original); url.searchParams.set('schema', schema);
const adminDb = new PrismaClient({ datasources: { db: { url: original } } }); let db; let app; let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const digest = value => createHash('sha256').update(value).digest('hex');
try {
  assert.match(schema, /^cf_billing_[a-f0-9]{32}$/); await adminDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', LOG_LEVEL: 'fatal', RATE_LIMIT_PREFIX: schema });
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  db = new PrismaClient();
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js');
  app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/api/v1`;
  async function actor(systemRole = 'USER') {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Billing QA', emailVerifiedAt: new Date(), systemRole } });
    const token = randomBytes(32).toString('base64url'); await db.session.create({ data: { userId: user.id, familyId: randomUUID(), refreshTokenHash: digest(randomUUID()), accessTokenHash: digest(token), expiresAt: new Date(Date.now()+600000), accessExpiresAt: new Date(Date.now()+600000) } }); return { id: user.id, token };
  }
  async function workspace(owner) { return db.workspace.create({ data: { name: 'Billing QA', slug: randomUUID(), memberships: { create: { userId: owner.id, role: 'OWNER' } } } }); }
  async function call(path, method = 'GET', body, actor) { const response = await fetch(`${base}${path}`, { method, headers: { ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, ...await response.json() }; }
  const owner = await actor(); const other = await actor(); const superAdmin = await actor('SUPER_ADMIN'); const w = await workspace(owner); const w2 = await workspace(other);
  const planBody = { code: 'STARTER_MONTHLY_V1', name: 'Starter', tier: 'STARTER', cadence: 'MONTHLY', priceMinor: '1299', currency: 'USD', memberLimit: 3, brandLimit: 2, storageLimitBytes: '209715200', periodCredits: '1000', features: ['media'], active: true };
  let paidPlan;
  await check('plan config requires system admin and validates price', async () => {
    assert.equal((await call('/admin/billing/plans', 'POST', planBody, owner)).status, 403);
    assert.equal((await call('/admin/billing/plans', 'POST', { ...planBody, priceMinor: '0' }, superAdmin)).status, 400);
    const created = await call('/admin/billing/plans', 'POST', planBody, superAdmin); assert.equal(created.status, 201); paidPlan = created.data;
    assert.equal((await call('/admin/billing/plans', 'POST', planBody, superAdmin)).status, 409);
    assert.equal((await call('/billing/plans')).data.length, 1);
  });
  await check('free activation, owner role and tenant isolation', async () => {
    const free = await db.plan.create({ data: { code: 'FREE_MONTHLY_V1', name: 'Free', monthlyCredits: 0n, priceMinor: 0n, currency: 'USD', active: true, memberLimit: 2 } });
    const member = await actor(); await db.membership.create({ data: { workspaceId: w.id, userId: member.id, role: 'EDITOR' } });
    assert.equal((await call(`/workspaces/${w.id}/billing/subscriptions`, 'POST', { planId: free.id, idempotencyKey: randomUUID() }, member)).status, 403);
    assert.equal((await call(`/workspaces/${w.id}/billing/subscription`, 'GET', undefined, other)).status, 404);
    const key = randomUUID(); const first = await call(`/workspaces/${w.id}/billing/subscriptions`, 'POST', { planId: free.id, idempotencyKey: key }, owner); assert.equal(first.status, 201); assert.equal(first.data.status, 'ACTIVE');
    const replay = await call(`/workspaces/${w.id}/billing/subscriptions`, 'POST', { planId: free.id, idempotencyKey: key }, owner); assert.equal(replay.data.id, first.data.id);
    assert.equal((await db.workspaceEntitlement.findUniqueOrThrow({ where: { workspaceId: w.id } })).brandLimit, 1);
  });
  await check('paid request stays pending and concurrent duplicate is blocked', async () => {
    const key = randomUUID(); const results = await Promise.all([call(`/workspaces/${w2.id}/billing/subscriptions`, 'POST', { planId: paidPlan.id, idempotencyKey: key }, other), call(`/workspaces/${w2.id}/billing/subscriptions`, 'POST', { planId: paidPlan.id, idempotencyKey: key }, other)]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 201]); assert.equal(results[0].data.id, results[1].data.id);
    assert.equal(results[0].data.status, 'INCOMPLETE'); assert.equal(await db.creditGrant.count({ where: { workspaceId: w2.id } }), 0);
    assert.equal((await db.payment.findFirstOrThrow({ where: { workspaceId: w2.id } })).amountMinor, 1299n);
    assert.equal((await call(`/workspaces/${w2.id}/billing/subscriptions`, 'POST', { planId: paidPlan.id, idempotencyKey: randomUUID() }, other)).status, 409);
  });
  await check('manual payment confirmation is admin-only, audited and idempotent', async () => {
    const payment = await db.payment.findFirstOrThrow({ where: { workspaceId: w2.id } }); const path = `/admin/billing/workspaces/${w2.id}/payments/${payment.id}/confirm`; const body = { evidence: 'Bank settlement reference QA-2026-001' };
    assert.equal((await call(path, 'POST', body, other)).status, 403);
    assert.equal((await call(path, 'POST', { evidence: 'short' }, superAdmin)).status, 400);
    assert.equal((await call(path, 'POST', body, superAdmin)).status, 201);
    assert.equal((await call(path, 'POST', body, superAdmin)).status, 201);
    assert.equal(await db.creditGrant.count({ where: { workspaceId: w2.id, source: 'SUBSCRIPTION' } }), 1);
    assert.equal((await db.creditAccount.findUniqueOrThrow({ where: { workspaceId: w2.id } })).balance, 1000n);
    assert.equal((await db.workspaceEntitlement.findUniqueOrThrow({ where: { workspaceId: w2.id } })).brandLimit, 2);
    assert.equal((await db.mediaQuota.findUniqueOrThrow({ where: { workspaceId: w2.id } })).limitBytes, 209715200n);
    assert.equal(await db.auditEvent.count({ where: { workspaceId: w2.id, action: 'billing.payment_manually_confirmed' } }), 1);
    assert.equal((await call(`/workspaces/${w2.id}/billing/invoices`, 'GET', undefined, owner)).status, 404);
  });
  await check('cancellation scheduled at period end', async () => {
    const subscription = await db.subscription.findFirstOrThrow({ where: { workspaceId: w2.id } });
    const result = await call(`/workspaces/${w2.id}/billing/subscriptions/${subscription.id}/cancel`, 'POST', { atPeriodEnd: true }, other); assert.equal(result.status, 201); assert.equal(result.data.cancelAtPeriodEnd, true);
    assert.equal((await call(`/workspaces/${w2.id}/billing/subscriptions/${subscription.id}/cancel`, 'POST', { atPeriodEnd: true }, owner)).status, 404);
  });
  await check('pending request may be cancelled without granting credits', async () => {
    const owner3 = await actor(); const w3 = await workspace(owner3);
    const created = await call(`/workspaces/${w3.id}/billing/subscriptions`, 'POST', { planId: paidPlan.id, idempotencyKey: randomUUID() }, owner3); assert.equal(created.status, 201);
    const cancelled = await call(`/workspaces/${w3.id}/billing/subscriptions/${created.data.id}/cancel`, 'POST', { atPeriodEnd: true }, owner3); assert.equal(cancelled.data.status, 'CANCELLED');
    assert.equal((await db.invoice.findFirstOrThrow({ where: { workspaceId: w3.id } })).status, 'VOID');
    assert.equal((await db.payment.findFirstOrThrow({ where: { workspaceId: w3.id } })).status, 'FAILED');
    assert.equal(await db.creditGrant.count({ where: { workspaceId: w3.id } }), 0);
  });
  console.log(`Billing integration: ${passed} scenarios passed`);
} finally {
  if (app) await app.close(); if (db) await db.$disconnect();
  if (/^cf_billing_[a-f0-9]{32}$/.test(schema)) await adminDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminDb.$disconnect();
}
