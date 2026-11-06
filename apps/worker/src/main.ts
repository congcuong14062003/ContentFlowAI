import { config } from 'dotenv';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import { writeFile, unlink } from 'node:fs/promises';
import { startMailWorker } from '@contentflow/mail';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { startOutbox } from './mail-outbox';
import { startNotificationJobs } from './notification-jobs';

config({ path: ['.env', '../../.env'], quiet: true });
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const redisUrl = z.url().refine((value) => /^rediss?:/.test(value) && decodeURIComponent(new URL(value).password).length >= 16 && !value.includes('REPLACE_ME'));
const heartbeatPath = '/tmp/contentflow-worker-ready';

async function main() {
  const parsed = redisUrl.safeParse(process.env.REDIS_URL);
  if (!parsed.success) throw new Error('Invalid Redis configuration');
  const connection = new Redis(parsed.data, { maxRetriesPerRequest: null, connectTimeout: 3000 });
  connection.on('error', () => logger.warn('Redis connection unavailable'));
  // Foundation-only queue. Business queues will have their own typed processors.
  const worker = new Worker('platform-health', async (job) => {
    if (job.name !== 'ping') throw new Error('Unsupported platform job');
    return { status: 'ok' };
  }, { connection, concurrency: 1 });
  worker.on('error', () => logger.error('Worker connection error'));
  worker.on('failed', (job) => logger.warn({ jobId: job?.id }, 'Platform job failed'));
  await worker.waitUntilReady();
  const mail = startMailWorker({ ...process.env, MAIL_LOCAL_DIR: process.env.MAIL_LOCAL_DIR || resolve(__dirname, '../../../.local/mail') });
  mail.worker.on('failed', (job) => logger.warn({ jobId: job?.id }, 'Email delivery failed; retry policy applies'));
  await mail.worker.waitUntilReady();
  const db = new PrismaClient(); await db.$connect();
  const outbox = startOutbox(db, process.env);
  await outbox.flush();
  const notificationJobs=startNotificationJobs(db,connection,process.env,logger);
  // Linux container health file is refreshed only after successful Redis ping.
  const heartbeat = async () => {
    try { await Promise.all([connection.ping(), db.$queryRaw`SELECT 1`, outbox.flush()]); await writeFile(heartbeatPath, String(Date.now())); }
    catch { await unlink(heartbeatPath).catch(() => undefined); }
  };
  if (process.platform !== 'win32') await heartbeat();
  const timer = setInterval(() => { if (process.platform !== 'win32') void heartbeat(); }, 5000);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    notificationJobs.close();
    await outbox.close();
    await worker.close();
    await mail.close();
    await connection.quit();
    await db.$disconnect();
    if (process.platform !== 'win32') await unlink(heartbeatPath).catch(() => undefined);
    logger.info('Worker stopped');
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  logger.info('Platform worker ready');
}
void main().catch(() => { logger.fatal('Worker startup failed'); process.exitCode = 1; });
