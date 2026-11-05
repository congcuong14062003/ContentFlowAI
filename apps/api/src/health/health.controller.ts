import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../platform/prisma.service';
import { RedisService } from '../platform/redis.service';
import { StorageService } from '../platform/storage.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(StorageService) private readonly storage: StorageService
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness' })
  live() { return { status: 'ok' }; }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: PostgreSQL, Redis and object storage bucket' })
  async ready() {
    const results = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping(), this.storage.check()
    ]);
    if (results.some((result) => result.status === 'rejected')) throw new ServiceUnavailableException();
    return { status: 'ok', checks: { database: 'up', redis: 'up', storage: 'up' } };
  }
}
