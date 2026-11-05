import 'reflect-metadata';
import { config } from 'dotenv';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url);
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module.js');
const { configureApp } = require('../apps/api/dist/bootstrap.js');
const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false });
console.log('Application created');
try {
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const live = await fetch(`${base}/api/v1/health/live`, { headers: { 'x-request-id': 'smoke-request-123' } });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-request-id'), 'smoke-request-123');
  assert.deepEqual(await live.json(), { data: { status: 'ok' }, requestId: 'smoke-request-123' });
  const missing = await fetch(`${base}/api/v1/nonexistent`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'HTTP_404');
  const docs = await fetch(`${base}/api/docs-json`);
  assert.equal(docs.status, 200);
  assert.ok((await docs.json()).paths['/api/v1/health/ready']);
  const readiness = await fetch(`${base}/api/v1/health/ready`, { signal: AbortSignal.timeout(10000) });
  if (process.env.EXPECT_STORAGE_READY === 'true') {
    assert.equal(readiness.status, 200);
    assert.equal((await readiness.json()).data.checks.storage, 'up');
  } else {
    assert.ok([200, 503].includes(readiness.status));
    if (readiness.status === 503) assert.equal((await readiness.json()).error.code, 'SERVICE_UNAVAILABLE');
  }
  console.log(`HTTP smoke passed: live=200, missing=404, Swagger=200, readiness=${readiness.status}`);
} finally {
  await app.close();
  console.log('Application resources closed');
}
