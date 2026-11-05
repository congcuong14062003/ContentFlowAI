import 'reflect-metadata';
import { config } from 'dotenv';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost', '127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Media tests require local PostgreSQL');
const schema = `cf_media_${randomUUID().replaceAll('-', '')}`; const url = new URL(original); url.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: original } } }); let db; let app; let storage; let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const digest = value => createHash('sha256').update(value).digest('hex');
const sharp = createRequire(resolve('apps/api/package.json'))('sharp');
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#7856ff' } }).png().toBuffer();
const form = (bytes = png, type = 'image/png', name = 'photo.png') => { const value = new FormData(); value.append('file', new Blob([bytes], { type }), name); return value; };
try {
  assert.match(schema, /^cf_media_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: url.toString(), NODE_ENV: 'test', LOG_LEVEL: 'fatal', RATE_LIMIT_PREFIX: schema });
  for (let i = 0; i < 2; i++) { const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr); }
  db = new PrismaClient();
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js'); const { StorageService } = require('../apps/api/dist/platform/storage.service.js');
  app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1'); storage = app.get(StorageService); const base = `${await app.getUrl()}/api/v1`;
  async function actor(role, workspaceId) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Media QA', emailVerifiedAt: new Date() } });
    if (workspaceId) await db.membership.create({ data: { workspaceId, userId: user.id, role } });
    const token = randomBytes(32).toString('base64url'); await db.session.create({ data: { userId: user.id, familyId: randomUUID(), refreshTokenHash: digest(randomUUID()), accessTokenHash: digest(token), expiresAt: new Date(Date.now()+600000), accessExpiresAt: new Date(Date.now()+600000) } }); return { id: user.id, token };
  }
  const owner = await actor(); const w = await db.workspace.create({ data: { name: 'Media QA', slug: randomUUID(), memberships: { create: { userId: owner.id, role: 'OWNER' } } } });
  const viewer = await actor('VIEWER', w.id); const outsider = await actor();
  async function call(path, method = 'GET', body, token = owner.token) {
    const response = await fetch(`${base}/workspaces/${w.id}/media${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const value = response.headers.get('content-type')?.includes('application/json') ? await response.json() : { data: Buffer.from(await response.arrayBuffer()) };
    return { status: response.status, ...value, headers: response.headers };
  }
  let folder; let asset;
  await check('folder creation, validation and workspace roles', async () => {
    assert.equal((await call('/folders', 'POST', { name: 'Campaign' })).status, 201);
    folder = (await call('/folders')).data[0]; assert.equal(folder.name, 'Campaign');
    assert.equal((await call('/folders', 'POST', { name: 'Campaign' })).status, 409);
    assert.equal((await call('/folders', 'POST', { name: 'x' }, viewer.token)).status, 403);
    assert.equal((await call('/folders', 'GET', undefined, outsider.token)).status, 404);
  });
  await check('image validation and tenant isolation', async () => {
    assert.equal((await call('', 'POST', form(Buffer.from('<svg/>'), 'image/svg+xml', 'bad.svg'))).status, 400);
    assert.equal((await call('', 'POST', form(png, 'image/jpeg', 'bad.jpg'))).status, 400);
    assert.equal((await call('', 'POST', form(Buffer.alloc(5242881)))).status, 413);
    assert.equal((await call('', 'POST', form(), viewer.token)).status, 403);
    assert.equal((await call('', 'GET', undefined, outsider.token)).status, 404);
  });
  await check('real S3 upload, thumbnail, metadata, authenticated download', async () => {
    const uploaded = await call(`?folderId=${folder.id}`, 'POST', form()); assert.equal(uploaded.status, 201); asset = uploaded.data;
    assert.equal(asset.width, 2); assert.equal(asset.folderId, folder.id);
    const file = await call(`/${asset.id}/file?download=1`); assert.equal(file.status, 200); assert.deepEqual(file.data, png); assert.match(file.headers.get('content-disposition'), /^attachment/);
    const thumb = await call(`/${asset.id}/thumbnail`); assert.equal(thumb.status, 200); assert.equal(thumb.headers.get('content-type'), 'image/webp'); assert.ok(thumb.data.length > 0);
    assert.equal((await call(`/${asset.id}/file`, 'GET', undefined, outsider.token)).status, 404);
    const row = await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } }); assert.equal((await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${row.storageKey}`)).status, 403);
    const usage = (await call('/usage')).data; assert.equal(usage.assetCount, 1); assert.equal(usage.usedBytes, String(asset.size + asset.thumbnailSize));
  });
  await check('tags, folders, search and pagination filter scope', async () => {
    assert.equal((await call(`/${asset.id}`, 'PATCH', { tags: ['launch'], folderId: folder.id })).status, 200);
    assert.equal((await call('?tag=launch&search=photo&limit=1')).data.items.length, 1);
    assert.equal((await call('?tag=missing')).data.items.length, 0);
    assert.equal((await call(`/${asset.id}`, 'PATCH', { tags: ['x'], folderId: randomUUID() })).status, 404);
    assert.equal((await call(`/${asset.id}`, 'PATCH', { tags: ['x'], folderId: null }, viewer.token)).status, 403);
  });
  await check('concurrent uploads cannot cross quota', async () => {
    const one = BigInt(asset.size + asset.thumbnailSize); await db.mediaQuota.create({ data: { workspaceId: w.id, limitBytes: one * 2n + 1n } });
    const results = await Promise.all([call('', 'POST', form()), call('', 'POST', form())]); assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    assert.equal((await call('/usage')).data.usedBytes, String(one * 2n));
  });
  await check('file deletion revokes access, releases quota and records audit', async () => {
    assert.equal((await call(`/${asset.id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/${asset.id}/file`)).status, 404);
    assert.equal((await call('/usage')).data.assetCount, 1);
    assert.equal((await call(`/folders/${folder.id}`, 'DELETE')).status, 200);
    assert.ok(await db.auditEvent.count({ where: { workspaceId: w.id, action: 'media.deleted' } }));
  });
  console.log(`Media integration: ${passed} scenarios passed`);
} finally {
  if (storage && db) for (const asset of await db.mediaAsset.findMany()) { await storage.remove(asset.storageKey).catch(() => undefined); if (asset.thumbnailKey) await storage.remove(asset.thumbnailKey).catch(() => undefined); }
  if (app) await app.close(); if (db) await db.$disconnect();
  if (/^cf_media_[a-f0-9]{32}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
}
