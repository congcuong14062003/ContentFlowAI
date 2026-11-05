import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { PrismaService } from '../platform/prisma.service';
import type { RedisService } from '../platform/redis.service';
import type { StorageService } from '../platform/storage.service';

function setup(failing?: 'db' | 'redis' | 'storage') {
  const check = (name: string) => vi.fn().mockImplementation(() => failing === name ? Promise.reject(new Error('secret connection detail')) : Promise.resolve('ok'));
  const db = { $queryRaw: check('db') };
  const redis = { client: { ping: check('redis') } };
  const storage = { check: check('storage') };
  return new HealthController(db as unknown as PrismaService, redis as unknown as RedisService, storage as unknown as StorageService);
}
describe('dependency readiness (unit)', () => {
  it('reports success only after every dependency responds', async () => {
    expect(await setup().ready()).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up', storage: 'up' } });
  });
  it.each(['db', 'redis', 'storage'] as const)('returns unavailable when %s fails, without upstream details', async (name) => {
    const promise = setup(name).ready();
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.not.toThrow('secret connection detail');
  });
});
