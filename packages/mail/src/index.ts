import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises'; import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createTransport } from 'nodemailer'; import { Queue, Worker } from 'bullmq'; import Redis from 'ioredis'; import { z } from 'zod';
export interface EncryptedMail { iv: string; tag: string; ciphertext: string }
const messageSchema = z.object({ to: z.email(), subject: z.string().max(200), text: z.string().max(10000) });
export const mailQueueName = 'identity-email';
export interface MailOutboxStore {
  pending(): Promise<{ id: string; payload: unknown }[]>;
  published(id: string): Promise<unknown>;
}
export function startMailDispatcher(store: MailOutboxStore, env: Record<string, string | undefined>) {
  const connection = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 1, commandTimeout: 3000, connectTimeout: 3000 });
  connection.on('error', () => undefined);
  const queue = new Queue<EncryptedMail>(mailQueueName, { connection, prefix: env.RATE_LIMIT_PREFIX || 'contentflow' });
  queue.on('error', () => undefined);
  let active: Promise<void> | undefined;
  const flush = () => active ??= (async () => {
    for (const event of await store.pending()) {
      await queue.add('send', event.payload as EncryptedMail, { jobId: event.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 31 * 86400 }, removeOnFail: 1000 });
      await store.published(event.id);
    }
  })().finally(() => { active = undefined; });
  const timer = setInterval(() => { void flush().catch(() => undefined); }, 1000);
  return { flush, async close() { clearInterval(timer); await active?.catch(() => undefined); await queue.close(); connection.disconnect(); } };
}
export function encryptMail(message: z.infer<typeof messageSchema>, key: string): EncryptedMail {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(messageSchema.parse(message)), 'utf8'), cipher.final()]);
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') };
}
export function startMailWorker(env: Record<string, string | undefined>) {
  const key = env.MAIL_ENCRYPTION_KEY; if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new Error('MAIL_ENCRYPTION_KEY must be 32 random hex bytes');
  if (env.NODE_ENV === 'production' && env.MAIL_MODE !== 'smtp') throw new Error('Production requires SMTP');
  if (!env.REDIS_URL || !['local', 'smtp'].includes(env.MAIL_MODE ?? 'local')) throw new Error('Mail/Redis configuration required');
  if (env.MAIL_MODE === 'smtp' && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM || !z.email().safeParse(env.MAIL_FROM).success)) throw new Error('Complete SMTP configuration required');
  const connection = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null }); connection.on('error', () => undefined);
  const worker = new Worker<EncryptedMail>(mailQueueName, async (job) => {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(job.data.iv, 'hex')); decipher.setAuthTag(Buffer.from(job.data.tag, 'hex'));
    const message = messageSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(job.data.ciphertext, 'base64')), decipher.final()]).toString('utf8')));
    if ((env.MAIL_MODE ?? 'local') === 'local') {
      const directory = resolve(env.MAIL_LOCAL_DIR || '.local/mail'); await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, `${randomUUID()}.json`), JSON.stringify({ ...message, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }); return;
    }
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM) throw new Error('SMTP configuration required');
    const port = Number(env.SMTP_PORT || 587);
    const transport = createTransport({ host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === 'true' || port === 465, requireTLS: true, tls: env.SMTP_CA_FILE ? { ca: readFileSync(env.SMTP_CA_FILE) } : undefined, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } });
    try { await transport.sendMail({ from: env.MAIL_FROM, ...message }); } catch { throw new Error('SMTP delivery failed'); } finally { transport.close(); }
  }, { connection, prefix: env.RATE_LIMIT_PREFIX || 'contentflow', concurrency: 3 });
  worker.on('error', () => undefined);
  return { worker, async close() { await worker.close(); await connection.quit(); } };
}
