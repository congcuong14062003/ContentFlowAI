import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { StorageService } from './storage.service';
import { AuditService } from '../audit/audit.service';

@Global()
@Module({ providers: [PrismaService, RedisService, StorageService, AuditService], exports: [PrismaService, RedisService, StorageService, AuditService] })
export class PlatformModule {}
