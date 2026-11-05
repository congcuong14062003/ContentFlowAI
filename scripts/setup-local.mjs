import { randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';

const password = randomBytes(24).toString('hex');
const redisPassword = randomBytes(24).toString('hex');
const accessKey = randomBytes(12).toString('hex');
const secretKey = randomBytes(32).toString('hex');
let template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
template = template.replace('POSTGRES_PASSWORD=', `POSTGRES_PASSWORD=${password}`)
  .replace('contentflow:REPLACE_ME@127.0.0.1', `contentflow:${password}@127.0.0.1`)
  .replace('REDIS_PASSWORD=', `REDIS_PASSWORD=${redisPassword}`)
  .replace('redis://:REPLACE_ME@127.0.0.1', `redis://:${redisPassword}@127.0.0.1`)
  .replace('S3_ACCESS_KEY=', `S3_ACCESS_KEY=${accessKey}`)
  .replace('S3_SECRET_KEY=', `S3_SECRET_KEY=${secretKey}`);
template = template.replace('MAIL_ENCRYPTION_KEY=', `MAIL_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);
try {
  await writeFile(new URL('../.env', import.meta.url), template, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with random local credentials. Existing files are never overwritten.');
} catch (error) {
  if (error.code === 'EEXIST') console.error('.env already exists; left unchanged.');
  else throw error;
  process.exitCode = 1;
}
