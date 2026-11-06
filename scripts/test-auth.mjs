import 'reflect-metadata';
import { config } from 'dotenv'; import { createRequire } from 'node:module'; import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process'; import { mkdir, readdir, readFile, rm } from 'node:fs/promises'; import { resolve } from 'node:path'; import assert from 'node:assert/strict'; import { createHash, createHmac } from 'node:crypto';
import { startMailWorker, startMailDispatcher } from '@contentflow/mail';
config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['127.0.0.1', 'localhost'].includes(new URL(original).hostname)) throw new Error('Auth integration requires an explicitly local database');
const schema = `cf_test_${randomUUID().replaceAll('-', '')}`; const database = new URL(original); database.searchParams.set('schema', schema);
const mailbox = resolve('.local', schema); await mkdir(mailbox, { recursive: true });
const admin = new PrismaClient({ datasources: { db: { url: original } } });
let app; let db; let mailWorker; let dispatcher; let passed = 0;
const password = `test-only-${randomUUID()}`;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
try {
  assert.match(schema, /^cf_test_[a-f0-9]{32}$/);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: database.toString(), NODE_ENV: 'test', MAIL_MODE: 'local', MAIL_LOCAL_DIR: mailbox, RATE_LIMIT_PREFIX: schema, LOG_LEVEL: 'fatal' });
  mailWorker = startMailWorker(process.env); await mailWorker.worker.waitUntilReady();
  const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, 'Isolated schema migration must succeed');
  db = new PrismaClient();
  dispatcher = startMailDispatcher({ pending: () => db.outboxEvent.findMany({ where: { topic: 'identity.email', publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 }), published: (id) => db.outboxEvent.update({ where: { id }, data: { publishedAt: new Date() } }) }, process.env);
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js');
  app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/api/v1`;
  async function call(path, method = 'GET', body, auth, cookie, origin = process.env.WEB_ORIGIN) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); return { status: response.status, data: data.data, error: data.error, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  async function mailToken(email, purpose) {
    const expected = purpose === 'invitations/accept' ? await db.invitation.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } }) : await db.userToken.findFirst({ where: { user: { email }, purpose: purpose === 'reset-password' ? 'RESET_PASSWORD' : 'VERIFY_EMAIL' }, orderBy: { createdAt: 'desc' } });
    for (let attempt = 0; attempt < 100; attempt++) {
    const messages = await Promise.all((await readdir(mailbox)).map(async (file) => JSON.parse(await readFile(resolve(mailbox, file), 'utf8'))));
    const message = messages.filter((m) => m.to === email && m.text.includes(purpose) && createHash('sha256').update(m.text.match(/#token=([A-Za-z0-9_-]{43})/)[1]).digest('hex') === expected?.tokenHash).at(-1); if (message) return message.text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
    await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Expected private ${purpose} email`);
  }
  async function mailCode(email) {
    const expected = await db.userToken.findFirst({ where: { user: { email }, purpose: 'VERIFY_EMAIL', usedAt: null }, orderBy: { createdAt: 'desc' } });
    for (let attempt = 0; attempt < 100; attempt++) {
      const messages = await Promise.all((await readdir(mailbox)).map(async (file) => JSON.parse(await readFile(resolve(mailbox, file), 'utf8'))));
      const message = messages.filter((item) => item.to === email && /Mã xác minh ContentFlow AI của bạn: (\d{6})/.test(item.text)).findLast((item) => {
        const code = item.text.match(/Mã xác minh ContentFlow AI của bạn: (\d{6})/)[1];
        return createHmac('sha256', process.env.MAIL_ENCRYPTION_KEY).update(`email-verification:${expected?.id}:${code}`).digest('hex') === expected?.tokenHash;
      });
      if (message) return message.text.match(/Mã xác minh ContentFlow AI của bạn: (\d{6})/)[1];
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Expected private verification code email');
  }
  async function register(email) { const r = await call('/auth/register', 'POST', { email, displayName: 'Integration User', password }); assert.equal(r.status, 201); }
  async function verify(email) { const r = await call('/auth/verify-email', 'POST', { email, code: await mailCode(email) }); assert.equal(r.status, 200); }
  async function login(email) { const r = await call('/auth/login', 'POST', { email, password }); assert.equal(r.status, 200); assert.ok(r.cookie); return r; }
  const ownerEmail = `${randomUUID()}@example.invalid`; const otherEmail = `${randomUUID()}@example.invalid`; const adminEmail = `${randomUUID()}@example.invalid`; let owner; let other; let manager; let workspace; let privateWorkspace; let invitation;
  await check('register, hashed credentials, verification requirement and no secret response', async () => {
    await register(ownerEmail); const row = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } }); assert.match(row.passwordHash, /^scrypt\$/); assert.notEqual(row.passwordHash, password);
    assert.equal((await call('/auth/login', 'POST', { email: ownerEmail, password })).status, 403);
    const firstCode = await mailCode(ownerEmail);
    assert.equal((await call('/auth/verify-email', 'POST', { email: ownerEmail, code: 'xxxxxx' })).status, 400);
    assert.equal((await call('/auth/verify-email', 'POST', { email: ownerEmail, code: firstCode === '000000' ? '000001' : '000000' })).status, 401);
    assert.equal((await call('/auth/resend-verification', 'POST', { email: ownerEmail })).status, 200);
    assert.equal((await call('/auth/verify-email', 'POST', { email: ownerEmail, code: firstCode })).status, 401);
    const currentCode = await mailCode(ownerEmail);
    assert.equal((await call('/auth/verify-email', 'POST', { email: ownerEmail, code: currentCode })).status, 200);
    assert.equal((await call('/auth/verify-email', 'POST', { email: ownerEmail, code: currentCode })).status, 401);
    owner = await login(ownerEmail); assert.match(owner.headers.get('set-cookie'), /HttpOnly/i); assert.match(owner.headers.get('set-cookie'), /SameSite=Lax/i);
  });
  await check('verification codes expire and repeated guesses are blocked', async () => {
    const expiredEmail = `${randomUUID()}@example.invalid`; await register(expiredEmail); const expiredCode = await mailCode(expiredEmail);
    await db.userToken.updateMany({ where: { user: { email: expiredEmail }, purpose: 'VERIFY_EMAIL' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call('/auth/verify-email', 'POST', { email: expiredEmail, code: expiredCode })).status, 401);
    const limitedEmail = `${randomUUID()}@example.invalid`; await register(limitedEmail); const actual = await mailCode(limitedEmail); const wrong = actual === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await call('/auth/verify-email', 'POST', { email: limitedEmail, code: wrong })).status, 401);
    assert.equal((await call('/auth/verify-email', 'POST', { email: limitedEmail, code: actual })).status, 401);
  });
  await check('invalid credentials, unknown DTO fields and cookie Origin protection', async () => {
    assert.equal((await call('/auth/login', 'POST', { email: ownerEmail, password: 'wrong' })).status, 401);
    assert.equal((await call('/auth/register', 'POST', { email: 'bad@example.invalid', displayName: 'bad', password, systemRole: 'SUPER_ADMIN' })).status, 400);
    assert.equal((await call('/auth/refresh', 'POST', undefined, undefined, owner.cookie, 'https://attacker.invalid')).status, 403);
  });
  await check('workspace creation, role ownership and persisted profile language', async () => {
    const r = await call('/workspaces', 'POST', { name: 'Workspace A' }, owner.data.accessToken); assert.equal(r.status, 201); workspace = r.data.id;
    const profile = await call('/users/me', 'PATCH', { displayName: 'Updated name', language: 'en' }, owner.data.accessToken); assert.equal(profile.data.language, 'en'); assert.equal(profile.data.systemRole, 'USER');
    assert.equal((await call('/users/me', 'PATCH', { systemRole: 'SUPER_ADMIN' }, owner.data.accessToken)).status, 400);
  });
  await check('cursor pagination reaches records beyond 100 and rejects foreign/invalid cursors', async () => {
    await db.$transaction(async (tx) => { for (let n = 0; n < 104; n++) await tx.workspace.create({ data: { name: `Page ${n}`, slug: randomUUID(), memberships: { create: { userId: owner.data.user.id, role: 'OWNER' } } } }); }, { timeout: 15000 });
    let cursor; const seen = new Set(); let first;
    do { const result = await call(`/workspaces?limit=17${cursor ? `&cursor=${cursor}` : ''}`, 'GET', undefined, owner.data.accessToken); assert.equal(result.status, 200); if (!first) first = result.data.nextCursor; for (const item of result.data.items) { assert.ok(!seen.has(item.workspace.id)); seen.add(item.workspace.id); } cursor = result.data.nextCursor; } while (cursor);
    assert.equal(seen.size, 105);
    assert.equal((await call('/workspaces?limit=101', 'GET', undefined, owner.data.accessToken)).status, 400);
    assert.equal((await call('/workspaces?cursor=invalid', 'GET', undefined, owner.data.accessToken)).status, 400);
    assert.equal((await call(`/workspaces/${workspace}/members?cursor=${first}`, 'GET', undefined, owner.data.accessToken)).status, 400);
  });
  await check('email outbox survives dispatcher interruption and rolls back with the domain transaction', async () => {
    await dispatcher.close();
    await call('/auth/forgot-password', 'POST', { email: ownerEmail });
    const pending = await db.outboxEvent.findMany({ where: { topic: 'identity.email', publishedAt: null } }); assert.ok(pending.length); assert.ok(!JSON.stringify(pending).includes(ownerEmail));
    const before = await db.outboxEvent.count();
    await assert.rejects(db.$transaction(async (tx) => { await tx.outboxEvent.create({ data: { topic: 'identity.email', aggregateId: randomUUID(), payload: { test: true } } }); throw new Error('rollback-only-test'); }));
    assert.equal(await db.outboxEvent.count(), before);
    dispatcher = startMailDispatcher({ pending: () => db.outboxEvent.findMany({ where: { topic: 'identity.email', publishedAt: null }, take: 100 }), published: (id) => db.outboxEvent.update({ where: { id }, data: { publishedAt: new Date() } }) }, process.env);
    await dispatcher.flush(); await mailToken(ownerEmail, 'reset-password');
    assert.equal(await db.outboxEvent.count({ where: { topic: 'identity.email', publishedAt: null } }), 0);
  });
  await register(otherEmail); await verify(otherEmail); other = await login(otherEmail); await register(adminEmail); await verify(adminEmail); manager = await login(adminEmail);
  await check('cross-workspace isolation and inaccessible IDs', async () => {
    privateWorkspace = (await call('/workspaces', 'POST', { name: 'Workspace B' }, other.data.accessToken)).data.id;
    for (const suffix of ['', '/members', '/invitations']) assert.equal((await call(`/workspaces/${workspace}${suffix}`, 'GET', undefined, other.data.accessToken)).status, 404);
    assert.equal((await call(`/workspaces/${workspace}`, 'PATCH', { name: 'stolen' }, other.data.accessToken)).status, 404);
    assert.equal((await call(`/workspaces/${workspace}`, 'PATCH', { name: 'safe', workspaceId: privateWorkspace }, owner.data.accessToken)).status, 400);
  });
  await check('invitation acceptance verifies email, is single-use and grants viewer', async () => {
    const invite = await call(`/workspaces/${workspace}/invitations`, 'POST', { email: otherEmail, role: 'VIEWER' }, owner.data.accessToken); assert.equal(invite.status, 201); invitation = invite.data.id; assert.equal(invite.data.tokenHash, undefined);
    const raw = await mailToken(otherEmail, 'invitations/accept'); assert.equal((await call('/invitations/accept', 'POST', { token: raw }, manager.data.accessToken)).status, 401);
    assert.equal((await call('/invitations/accept', 'POST', { token: raw }, other.data.accessToken)).status, 201);
    assert.equal((await call('/invitations/accept', 'POST', { token: raw }, other.data.accessToken)).status, 401);
    assert.equal((await call(`/workspaces/${workspace}`, 'GET', undefined, other.data.accessToken)).data.role, 'VIEWER');
  });
  await check('viewer cannot edit, invite, elevate role or revoke foreign invitation', async () => {
    assert.equal((await call(`/workspaces/${workspace}`, 'PATCH', { name: 'stolen' }, other.data.accessToken)).status, 403);
    assert.equal((await call(`/workspaces/${workspace}/members/${other.data.user.id}`, 'PATCH', { role: 'ADMIN' }, other.data.accessToken)).status, 403);
    assert.equal((await call(`/workspaces/${workspace}/invitations`, 'POST', { email: adminEmail, role: 'ADMIN' }, other.data.accessToken)).status, 403);
    assert.equal((await call(`/workspaces/${privateWorkspace}/invitations/${invitation}`, 'DELETE', undefined, other.data.accessToken)).status, 404);
  });
  await check('admin cannot grant admin, modify owner or remove last owner', async () => {
    await call(`/workspaces/${workspace}/invitations`, 'POST', { email: adminEmail, role: 'ADMIN' }, owner.data.accessToken);
    await call('/invitations/accept', 'POST', { token: await mailToken(adminEmail, 'invitations/accept') }, manager.data.accessToken);
    assert.equal((await call(`/workspaces/${workspace}/members/${other.data.user.id}`, 'PATCH', { role: 'ADMIN' }, manager.data.accessToken)).status, 403);
    assert.equal((await call(`/workspaces/${workspace}/members/${owner.data.user.id}`, 'DELETE', undefined, manager.data.accessToken)).status, 403);
    assert.equal((await call(`/workspaces/${workspace}/members/${owner.data.user.id}`, 'DELETE', undefined, owner.data.accessToken)).status, 403);
    assert.equal((await call(`/workspaces/${workspace}/invitations`, 'POST', { email: otherEmail, role: 'OWNER' }, owner.data.accessToken)).status, 400);
  });
  await check('revoked invitation cannot be accepted', async () => {
    const r = await call(`/workspaces/${workspace}/invitations`, 'POST', { email: otherEmail, role: 'EDITOR' }, owner.data.accessToken); const raw = await mailToken(otherEmail, 'invitations/accept');
    assert.equal((await call(`/workspaces/${workspace}/invitations/${r.data.id}`, 'DELETE', undefined, owner.data.accessToken)).status, 200);
    assert.equal((await call('/invitations/accept', 'POST', { token: raw }, other.data.accessToken)).status, 401);
  });
  await check('system role is independent of workspace admin role', async () => {
    assert.equal((await call('/admin/access', 'GET', undefined, manager.data.accessToken)).status, 403);
    assert.equal((await call('/admin/access', 'GET', undefined, owner.data.accessToken)).status, 403);
    const promote = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/bootstrap-admin.ts'], { env: { ...process.env, BOOTSTRAP_ADMIN_EMAIL: adminEmail, BOOTSTRAP_ADMIN_CONFIRM: 'PROMOTE_VERIFIED_USER' }, encoding: 'utf8' }); assert.equal(promote.status, 0);
    const repeated = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/bootstrap-admin.ts'], { env: { ...process.env, BOOTSTRAP_ADMIN_EMAIL: ownerEmail, BOOTSTRAP_ADMIN_CONFIRM: 'PROMOTE_VERIFIED_USER' }, encoding: 'utf8' }); assert.equal(repeated.status, 1);
    assert.equal((await call('/admin/access', 'GET', undefined, manager.data.accessToken)).status, 200);
    assert.equal((await call(`/workspaces/${privateWorkspace}`, 'GET', undefined, manager.data.accessToken)).status, 404);
  });
  await check('refresh rotation rejects replay and revokes the complete token family', async () => {
    const refreshed = await call('/auth/refresh', 'POST', undefined, undefined, owner.cookie); assert.equal(refreshed.status, 200); assert.notEqual(refreshed.cookie, owner.cookie);
    assert.equal((await call('/users/me', 'GET', undefined, owner.data.accessToken)).status, 401);
    assert.equal((await call('/auth/refresh', 'POST', undefined, undefined, owner.cookie)).status, 401);
    assert.equal((await call('/users/me', 'GET', undefined, refreshed.data.accessToken)).status, 401); owner = await login(ownerEmail);
  });
  await check('session revocation is scoped to the current user and takes effect immediately', async () => {
    const sessions = await call('/users/me/sessions', 'GET', undefined, manager.data.accessToken); const current = sessions.data.currentSessionId;
    await call(`/users/me/sessions/${current}`, 'DELETE', undefined, owner.data.accessToken); assert.equal((await call('/users/me', 'GET', undefined, manager.data.accessToken)).status, 200);
    await call(`/users/me/sessions/${current}`, 'DELETE', undefined, manager.data.accessToken); assert.equal((await call('/users/me', 'GET', undefined, manager.data.accessToken)).status, 401);
  });
  await check('concurrent refresh reuse revokes the winning rotated session', async () => {
    const session = await login(otherEmail);
    const results = await Promise.all([call('/auth/refresh', 'POST', undefined, undefined, session.cookie), call('/auth/refresh', 'POST', undefined, undefined, session.cookie)]);
    assert.deepEqual(results.map((item) => item.status).sort(), [200, 401]);
    assert.equal((await call('/users/me', 'GET', undefined, results.find((item) => item.status === 200).data.accessToken)).status, 401);
  });
  await check('forgot/reset password is single-use and revokes existing sessions', async () => {
    assert.deepEqual((await call('/auth/forgot-password', 'POST', { email: ownerEmail })).data, (await call('/auth/forgot-password', 'POST', { email: 'unknown@example.invalid' })).data);
    const raw = await mailToken(ownerEmail, 'reset-password'); const next = `${password}-new`;
    assert.equal((await call('/auth/reset-password', 'POST', { token: raw, password: next })).status, 200);
    assert.equal((await call('/auth/reset-password', 'POST', { token: raw, password: next })).status, 401);
    assert.equal((await call('/users/me', 'GET', undefined, owner.data.accessToken)).status, 401);
    assert.equal((await call('/auth/login', 'POST', { email: ownerEmail, password })).status, 401);
    const r = await call('/auth/login', 'POST', { email: ownerEmail, password: next }); assert.equal(r.status, 200); owner = r;
    assert.equal((await call('/users/me/password', 'POST', { currentPassword: 'wrong', password }, owner.data.accessToken)).status, 401);
    assert.equal((await call('/users/me/password', 'POST', { currentPassword: next, password }, owner.data.accessToken)).status, 200);
    assert.equal((await call('/users/me', 'GET', undefined, owner.data.accessToken)).status, 401);
  });
  await check('logout revokes access and refresh tokens', async () => { owner = await login(ownerEmail); assert.equal((await call('/auth/logout', 'POST', undefined, undefined, owner.cookie)).status, 200); assert.equal((await call('/users/me', 'GET', undefined, owner.data.accessToken)).status, 401); assert.equal((await call('/auth/refresh', 'POST', undefined, undefined, owner.cookie)).status, 401); });
  await check('unconfigured OAuth fails explicitly, privileged mutations are audited, auth is rate limited', async () => {
    assert.equal((await call('/auth/options')).data.google, false); assert.equal((await call('/auth/google')).status, 503);
    assert.ok(await db.auditEvent.count({ where: { action: 'membership.role_changed.denied' } }));
    let limited = false; for (let i = 0; i < 22; i++) { if ((await call('/auth/forgot-password', 'POST', { email: 'unknown@example.invalid' })).status === 429) { limited = true; break; } } assert.equal(limited, true);
  });
  console.log(`Auth/workspace integration: ${passed} security scenarios passed`);
} finally {
  if (app) await app.close(); if (dispatcher) await dispatcher.close(); if (mailWorker) await mailWorker.close(); if (db) await db.$disconnect();
  // Only the exact random schema created by this run can be removed. Existing schemas/data are untouched.
  if (/^cf_test_[a-f0-9]{32}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
  assert.equal(mailbox, resolve('.local', schema)); await rm(mailbox, { recursive: true, force: true });
}
