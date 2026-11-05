import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Environment } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    this.client = new Redis(config.get('REDIS_URL'), { connectTimeout: 3000, commandTimeout: 3000, maxRetriesPerRequest: 1, lazyConnect: true });
    // Errors are surfaced by readiness checks; never log the connection URL.
    this.client.on('error', () => undefined);
  }
  async onModuleDestroy() { this.client.disconnect(); }
}
