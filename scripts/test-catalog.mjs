import 'reflect-metadata';
import { config } from 'dotenv'; import { createRequire } from 'node:module'; import { randomUUID, randomBytes, createHash } from 'node:crypto'; import { spawnSync } from 'node:child_process'; import assert from 'node:assert/strict';
config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url); const { PrismaClient } = require('@prisma/client');
const original = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!original || !['localhost', '127.0.0.1'].includes(new URL(original).hostname)) throw new Error('Catalog tests require local PostgreSQL');
const schema = `cf_catalog_${randomUUID().replaceAll('-', '')}`; const database = new URL(original); database.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: original } } }); let db; let app; let storage; let passed = 0;
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const digest = raw => createHash('sha256').update(raw).digest('hex');
try {
  assert.match(schema, /^cf_catalog_[a-f0-9]{32}$/); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  Object.assign(process.env, { DATABASE_URL: database.toString(), NODE_ENV: 'test', LOG_LEVEL: 'fatal', RATE_LIMIT_PREFIX: schema, DEFAULT_BRAND_LIMIT: '1' });
  for (let i = 0; i < 2; i++) { const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { env: process.env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr); }
  db = new PrismaClient();
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../apps/api/dist/app.module.js'); const { configureApp } = require('../apps/api/dist/bootstrap.js'); const { StorageService } = require('../apps/api/dist/platform/storage.service.js');
  app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false }); await configureApp(app); await app.listen(0, '127.0.0.1'); storage = app.get(StorageService); const base = `${await app.getUrl()}/api/v1`;
  async function actor(role, workspaceId) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, displayName: 'Catalog fixture', emailVerifiedAt: new Date() } });
    if (workspaceId) await db.membership.create({ data: { workspaceId, userId: user.id, role } });
    const token = randomBytes(32).toString('base64url'); await db.session.create({ data: { userId: user.id, familyId: randomUUID(), refreshTokenHash: digest(randomUUID()), accessTokenHash: digest(token), expiresAt: new Date(Date.now() + 600000), accessExpiresAt: new Date(Date.now() + 600000) } }); return { token, id: user.id };
  }
  const owner = await actor(); const w = await db.workspace.create({ data: { name: 'Catalog test', slug: randomUUID(), memberships: { create: { userId: owner.id, role: 'OWNER' } } } });
  const editor = await actor('EDITOR', w.id); const viewer = await actor('VIEWER', w.id); const outsider = await actor();
  const foreign = await db.workspace.create({ data: { name: 'Other tenant', slug: randomUUID(), memberships: { create: { userId: outsider.id, role: 'OWNER' } } } });
  async function call(path, method = 'GET', body, token = owner.token) {
    const response = await fetch(`${base}/workspaces/${w.id}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const value = response.headers.get('content-type')?.includes('application/json') ? await response.json() : { data: Buffer.from(await response.arrayBuffer()) }; return { status: response.status, ...value, headers: response.headers };
  }
  const kit = { schemaVersion: 1, colors: ['#7856FF'], industry: 'Software', businessDescription: 'A real persisted test record', targetAudiences: ['Teams'], voice: 'Clear', tone: ['Warm'], keywords: ['content'], forbiddenPhrases: [], preferredCta: 'Try it', languages: ['vi','en'], socialPlatforms: ['website'], aiInstructions: 'Use short sentences' };
  let brand; let second; let product; let asset;
  await check('DTO/context validation, unknown fields and unauthenticated denial', async () => {
    assert.equal((await call('/brands', 'POST', { name: 'Bad', guidelines: {} })).status, 400);
    assert.equal((await call('/brands', 'POST', { name: 'Bad', guidelines: kit, workspaceId: foreign.id })).status, 400);
    assert.equal((await call('/brands', 'POST', { name: 'Bad', guidelines: { ...kit, colors: ['red'] } })).status, 400);
    assert.equal((await call('/brands', 'GET', undefined, '')).status, 401);
  });
  await check('concurrent brand creation observes workspace entitlement atomically', async () => {
    const results = await Promise.all(['A', 'B'].map(name => call('/brands', 'POST', { name, guidelines: kit })));
    assert.deepEqual(results.map(r => r.status).sort(), [201,409]); brand = results.find(r => r.status === 201).data; assert.equal(brand.isDefault, true);
    assert.equal((await call('/catalog-entitlement')).data.brandsUsed, 1);
  });
  await check('brand update, name conflict, persisted context and role policy', async () => {
    assert.equal((await call(`/brands/${brand.id}`, 'PATCH', { name: 'Updated brand', guidelines: kit }, editor.token)).status, 200);
    assert.equal((await call(`/brands/${brand.id}`, 'PATCH', { name: 'Forbidden', guidelines: kit }, viewer.token)).status, 403);
    assert.equal((await call(`/brands/${brand.id}/default`, 'POST', undefined, editor.token)).status, 403);
    assert.equal((await call(`/brands/${brand.id}`)).data.guidelines.voice, 'Clear');
    assert.equal((await call(`/brands/${brand.id}/context`)).data.kit.schemaVersion, 1);
    assert.equal((await call(`/brands/${brand.id}/context`, 'GET', undefined, outsider.token)).status, 404);
    await db.workspaceEntitlement.create({ data: { workspaceId: w.id, brandLimit: 3 } });
    assert.equal((await call('/brands', 'POST', { name: 'Updated brand', guidelines: kit })).status, 409);
    second = (await call('/brands', 'POST', { name: 'Second', guidelines: kit })).data;
    assert.equal((await call(`/brands/${second.id}/default`, 'POST')).status, 201);
    assert.equal(await db.brand.count({ where: { workspaceId: w.id, isDefault: true } }), 1);
  });
  await check('tenant isolation covers reads, writes and inaccessible resource IDs', async () => {
    for (const path of ['/brands', `/brands/${brand.id}`, '/catalog-entitlement', '/products']) assert.equal((await call(path, 'GET', undefined, outsider.token)).status, 404);
    assert.equal((await call(`/brands/${brand.id}`, 'DELETE', undefined, outsider.token)).status, 404);
  });
  const dto = { name: 'Service', description: 'Description', priceReference: 'From 1,000,000 VND', features: ['Feature'], benefits: ['Benefit'], audiences: ['Team'], categories: ['Software'], tags: ['new'], status: 'ACTIVE', brandIds: [brand.id, second.id] };
  await check('product CRUD, validation and composite brand tenant boundary', async () => {
    let r = await call('/products', 'POST', dto, editor.token); assert.equal(r.status, 201); product = r.data;
    assert.equal((await call('/products', 'POST', { ...dto, status: 'HACK' })).status, 400);
    assert.equal((await call('/products', 'POST', dto, viewer.token)).status, 403);
    const foreignBrand = await db.brand.create({ data: { workspaceId: foreign.id, name: 'Foreign' } });
    assert.equal((await call(`/products/${product.id}`, 'PATCH', { ...dto, brandIds: [foreignBrand.id] })).status, 400);
    r = await call(`/products/${product.id}`, 'PATCH', { ...dto, status: 'ARCHIVED' }); assert.equal(r.status, 200);
    assert.equal((await call(`/products/${product.id}`)).data.brands.length, 2);
    assert.equal((await call(`/products/${product.id}`, 'GET', undefined, outsider.token)).status, 404);
    await assert.rejects(db.productBrand.create({ data: { workspaceId: w.id, productId: product.id, brandId: foreignBrand.id } }));
  });
  await check('search, category/tag/status/brand filters and stable cursor pagination', async () => {
    for (let n = 0; n < 4; n++) assert.equal((await call('/products', 'POST', { ...dto, name: `Paged ${n}` })).status, 201);
    const first = await call('/products?limit=2&status=ACTIVE'); const next = await call(`/products?limit=2&status=ACTIVE&cursor=${first.data.nextCursor}`);
    assert.equal(first.data.items.length, 2); assert.equal(next.data.items.length, 2); assert.equal(new Set([...first.data.items, ...next.data.items].map(r => r.id)).size, 4);
    assert.equal((await call(`/products?status=ARCHIVED&cursor=${first.data.nextCursor}`)).status, 400);
    assert.equal((await call(`/products?search=Service&category=Software&tag=new&status=ARCHIVED&brandId=${brand.id}`)).data.items.length, 1);
    assert.equal((await call('/products?tag=missing')).data.items.length, 0);
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=', 'base64');
  function upload(bytes = png, type = 'image/png', filename = 'logo.png') { const form = new FormData(); form.append('file', new Blob([bytes], { type }), filename); return form; }
  await check('real S3 image upload, private read, tenant denial and owned logo selection', async () => {
    const r = await call(`/brands/${brand.id}/assets`, 'POST', upload()); assert.equal(r.status, 201); asset = r.data;
    const read = await call(`/assets/${asset.id}`); assert.equal(read.status, 200); assert.deepEqual(read.data, png); assert.equal(read.headers.get('cache-control'), 'private, no-store');
    assert.equal((await call(`/assets/${asset.id}`, 'GET', undefined, outsider.token)).status, 404);
    assert.equal((await call(`/brands/${brand.id}/logo`, 'PATCH', { assetId: asset.id })).status, 200);
    assert.equal((await call(`/brands/${second.id}/logo`, 'PATCH', { assetId: asset.id })).status, 404);
    const row = await db.catalogAsset.findUniqueOrThrow({ where: { id: asset.id } }); const raw = await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${row.storageKey}`); assert.equal(raw.status, 403);
    await assert.rejects(db.brand.update({ where: { id: second.id }, data: { logoAssetId: asset.id } }));
  });
  await check('upload validation rejects SVG, MIME spoofing, oversize and viewer writes', async () => {
    assert.equal((await call(`/brands/${brand.id}/assets`, 'POST', upload(Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg'))).status, 400);
    assert.equal((await call(`/brands/${brand.id}/assets`, 'POST', upload(png, 'image/jpeg'))).status, 400);
    assert.equal((await call(`/brands/${brand.id}/assets`, 'POST', upload(Buffer.alloc(5242881)))).status, 413);
    assert.equal((await call(`/products/${product.id}/assets`, 'POST', upload(), viewer.token)).status, 403);
    assert.equal((await call(`/products/${product.id}/assets`, 'POST', upload())).status, 201);
  });
  await check('asset removal clears logo, soft deletion keeps references, default reassignment and audit', async () => {
    assert.equal((await call(`/assets/${asset.id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/assets/${asset.id}`)).status, 404);
    assert.equal((await call(`/brands/${brand.id}`)).data.logoAssetId, null);
    assert.equal((await call(`/brands/${second.id}`, 'DELETE', undefined, editor.token)).status, 403);
    assert.equal((await call(`/brands/${second.id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/brands/${brand.id}`)).data.isDefault, true);
    assert.equal((await call(`/products/${product.id}`)).data.brands.length, 1);
    assert.equal((await call(`/products/${product.id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/products/${product.id}`)).status, 404);
    assert.ok(await db.product.findUnique({ where: { id: product.id } }));
    assert.ok(await db.auditEvent.count({ where: { workspaceId: w.id, action: 'brand.created' } }));
  });
  await check('only a verified system administrator can provision allowances; downgrade retains data', async () => {
    const env = { ...process.env, ENTITLEMENT_WORKSPACE_ID: w.id, ENTITLEMENT_ACTOR_ID: owner.id, ENTITLEMENT_BRAND_LIMIT: '0' };
    const invoke = () => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/set-brand-limit.ts'], { env, encoding: 'utf8', windowsHide: true });
    assert.equal(invoke().status, 1); // Workspace ownership alone cannot change commercial allowances.
    assert.equal((await call('/catalog-entitlement')).data.brandLimit, 3);
    await db.user.update({ where: { id: owner.id }, data: { systemRole: 'SUPER_ADMIN' } });
    assert.equal(invoke().status, 0);
    const allowance = (await call('/catalog-entitlement')).data; assert.equal(allowance.brandLimit, 0); assert.equal(allowance.brandsUsed, 1);
    const blocked = await call('/brands', 'POST', { name: 'Blocked after downgrade', guidelines: kit }); assert.equal(blocked.status, 409); assert.equal(blocked.error.code, 'BRAND_LIMIT');
    assert.ok(await db.auditEvent.count({ where: { workspaceId: w.id, action: 'catalog.entitlement_changed' } }));
  });
  console.log(`Catalog integration: ${passed} scenarios passed`);
} finally {
  // Only generated catalog test schema keys can be removed; production data is never truncated.
  if (storage && db) for (const asset of await db.catalogAsset.findMany()) await storage.remove(asset.storageKey);
  if (app) await app.close(); if (db) await db.$disconnect();
  if (/^cf_catalog_[a-f0-9]{32}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
}
