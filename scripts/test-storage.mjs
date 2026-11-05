import { config } from 'dotenv'; import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
config({ path: '.env', quiet: true });
const endpoint = new URL(process.env.S3_ENDPOINT);
if (!['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('Storage acceptance script requires local storage');
const client = new S3Client({ endpoint: endpoint.toString(), region: process.env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
const Bucket = process.env.S3_BUCKET; const Key = `foundation-qa/${randomUUID()}.txt`; const body = randomUUID();
try {
  await client.send(new HeadBucketCommand({ Bucket }));
  await client.send(new PutObjectCommand({ Bucket, Key, Body: body }));
  const result = await client.send(new GetObjectCommand({ Bucket, Key })); assert.equal(await result.Body.transformToString(), body);
  const anonymous = await fetch(new URL(`${Bucket}/${Key}`, endpoint)); assert.equal(anonymous.status, 403);
  const ready = await fetch('http://127.0.0.1:3000/api/v1/health/ready'); assert.equal(ready.status, 200); assert.equal((await ready.json()).data.checks.storage, 'up');
  console.log('S3 bucket, PUT/GET, private access and API readiness=200 verified');
} finally { await client.send(new DeleteObjectCommand({ Bucket, Key })); client.destroy(); }
