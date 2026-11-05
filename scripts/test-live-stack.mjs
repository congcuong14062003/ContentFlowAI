import assert from 'node:assert/strict';
import { config } from 'dotenv';
config({ path: '.env', quiet: true });
const port = Number(process.env.API_HOST_PORT || 3000);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const base = `http://127.0.0.1:${port}/api/v1`;
const live = await fetch(`${base}/health/live`, { headers: { 'x-request-id': 'foundation-stack-check' } });
assert.equal(live.status, 200); assert.equal(live.headers.get('x-request-id'), 'foundation-stack-check');
const ready = await fetch(`${base}/health/ready`); assert.equal(ready.status, 200);
assert.deepEqual((await ready.json()).data.checks, { database: 'up', redis: 'up', storage: 'up' });
// Deliberately incomplete: must fail before any registration/user persistence.
const invalid = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unexpected: true }) });
assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
assert.equal((await fetch('http://127.0.0.1:5173')).status, 200);
console.log('Live stack: liveness/readiness/web=200, request ID and actual dev DTO validation=400 passed');
