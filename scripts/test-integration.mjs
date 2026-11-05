import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

config({ path: '.env', quiet: true });
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error('Run local setup first');
// Explicitly opt into the local foundation services, never auto-detect a production database.
for (const key of ['DATABASE_URL', 'REDIS_URL']) {
  const url = new URL(process.env[key]);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local integration runner only accepts loopback service URLs');
}
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
  stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: process.env.DATABASE_URL, TEST_REDIS_URL: process.env.REDIS_URL }
});
process.exitCode = result.status ?? 1;
