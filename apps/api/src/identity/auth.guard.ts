import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException, HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../platform/prisma.service';
import { RedisService } from '../platform/redis.service';
import { digest } from './crypto';
import { AuditService } from '../audit/audit.service';
export const publicUser = { id: true, email: true, displayName: true, language: true, systemRole: true, emailVerifiedAt: true } as const;
export interface Principal { id: string; sessionId: string; email: string; displayName: string; language: string; systemRole: 'USER' | 'SUPER_ADMIN'; emailVerifiedAt: Date | null }
export interface AuthRequest extends Request { principal: Principal }

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const raw = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!raw) throw new UnauthorizedException();
    const session = await this.prisma.session.findFirst({ where: { accessTokenHash: digest(raw), accessExpiresAt: { gt: new Date() }, expiresAt: { gt: new Date() }, revokedAt: null, user: { disabledAt: null } }, include: { user: { select: publicUser } } });
    if (!session) throw new UnauthorizedException();
    request.principal = { ...session.user, sessionId: session.id };
    return true;
  }
}
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuditService) private readonly audit: AuditService) {}
  async canActivate(context: ExecutionContext) {
    const principal = context.switchToHttp().getRequest<AuthRequest>().principal;
    if (principal.systemRole !== 'SUPER_ADMIN') { await this.audit.record(this.db, { actorId: principal.id, action: 'system.admin_access_denied', entityType: 'user', entityId: principal.id }); throw new ForbiddenException(); }
    return true;
  }
}
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    if (context.switchToHttp().getRequest<Request>().headers.origin !== this.config.get<string>('WEB_ORIGIN')) throw new ForbiddenException('Invalid request origin');
    return true;
  }
}
@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(@Inject(RedisService) private readonly redis: RedisService, @Inject(ConfigService) private readonly config: ConfigService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const count = await this.redis.client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, `${this.config.get('RATE_LIMIT_PREFIX', 'contentflow')}:auth-limit:${digest(`${request.ip}:${request.route?.path ?? request.path}`)}`);
    if (Number(count) > 20) throw new HttpException('Too many requests. Try again later.', 429);
    return true;
  }
}
