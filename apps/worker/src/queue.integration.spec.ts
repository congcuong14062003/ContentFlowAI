import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import Redis from 'ioredis';
import { describe, expect, it } from 'vitest';

const url = process.env.TEST_REDIS_URL;
describe.skipIf(!url)('real BullMQ integration (requires TEST_REDIS_URL)', () => {
  it('enqueues and consumes a platform ping', async () => {
    const connection = new Redis(url!, { maxRetriesPerRequest: null, connectTimeout: 3000, commandTimeout: 3000 });
    const name = `platform-test-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    const worker = new Worker(name, async (job) => ({ received: job.name }), { connection });
    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
      const job = await queue.add('ping', {}, { removeOnComplete: true, removeOnFail: true });
      expect(await job.waitUntilFinished(events, 5000)).toEqual({ received: 'ping' });
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
      await connection.quit();
    }
  });
});
