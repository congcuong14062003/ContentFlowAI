import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type TokenPurpose } from '@prisma/client';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../platform/prisma.service';
import { MailService } from './mail.service';
import { RedisService } from '../platform/redis.service';
import { digest, hashPassword, token, verifyPassword } from './crypto';
import { publicUser } from './auth.guard';
import type { RegisterDto, ProfileDto } from './identity.dto';
import { AuditService } from '../audit/audit.service';
const invalid = () => new UnauthorizedException('Invalid credentials or expired token');

@Injectable()
export class IdentityService {
  private dummyHash: Promise<string> = hashPassword(token());
  publicProfiles(userIds: string[]) { return this.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }); }
  async requireSystemAdmin(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findFirst({ where: { id: userId, systemRole: 'SUPER_ADMIN', disabledAt: null, emailVerifiedAt: { not: null } }, select: { id: true } });
    if (!user) throw new ForbiddenException();
  }
  async requireActiveVerifiedUser(tx: Prisma.TransactionClient, userId: string) {
    if (!await tx.user.findFirst({ where: { id: userId, disabledAt: null, emailVerifiedAt: { not: null } }, select: { id: true } })) throw new ForbiddenException();
  }
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(MailService) private readonly mail: MailService, @Inject(ConfigService) private readonly config: ConfigService, @Inject(AuditService) private readonly audit: AuditService, @Inject(RedisService) private readonly redis: RedisService) {}

  async register(dto: RegisterDto) {
    const passwordHash = await hashPassword(dto.password);
    try {
      await this.db.$transaction(async (tx) => { const created = await tx.user.create({ data: { email: dto.email, displayName: dto.displayName.trim(), passwordHash, language: dto.language ?? 'vi' } }); await this.audit.record(tx, { actorId: created.id, action: 'identity.registered', entityType: 'user', entityId: created.id }); await this.issueToken(tx, created.id, created.email, 'VERIFY_EMAIL'); });
    } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error; }
    return { accepted: true };
  }
  private async issueToken(tx: Prisma.TransactionClient, userId: string, email: string, purpose: TokenPurpose) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    await tx.userToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    if (purpose === 'VERIFY_EMAIL') {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const id = randomUUID();
      const record = await tx.userToken.create({ data: { id, userId, purpose, tokenHash: this.verificationHash(id, code), expiresAt: new Date(Date.now() + 10 * 60000) } });
      await this.mail.enqueue(tx, record.id, email, 'ContentFlow AI: mã xác minh email', `Mã xác minh ContentFlow AI của bạn: ${code}\n\nMã có hiệu lực trong 10 phút. Không chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua email này.\n\nYour verification code is ${code}. It expires in 10 minutes.`);
      return;
    }
    const raw = token();
    const record = await tx.userToken.create({ data: { userId, purpose, tokenHash: digest(raw), expiresAt: new Date(Date.now() + (purpose === 'RESET_PASSWORD' ? 30 : 1440) * 60000) } });
    const path = purpose === 'RESET_PASSWORD' ? '/reset-password' : '/verify-email';
    const url = `${this.config.get<string>('WEB_ORIGIN')}${path}#token=${raw}`;
    await this.mail.enqueue(tx, record.id, email, purpose === 'RESET_PASSWORD' ? 'ContentFlow AI: reset password' : 'ContentFlow AI: verify email', `${url}\n\nThis link is private and expires. If you did not request it, ignore this email.`);
  }
  private verificationHash(tokenId: string, code: string) { return createHmac('sha256', this.config.getOrThrow<string>('MAIL_ENCRYPTION_KEY')).update(`email-verification:${tokenId}:${code}`).digest('hex'); }
  async consumeVerificationCode(email: string, code: string) {
    const key = `${this.config.get('RATE_LIMIT_PREFIX', 'contentflow')}:verify-code:${digest(email)}`;
    const attempts = await this.redis.client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600) end; return n", 1, key);
    if (Number(attempts) > 5) throw invalid();
    const user = await this.db.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw invalid();
    const verified = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const record = await tx.userToken.findFirst({ where: { userId: user.id, purpose: 'VERIFY_EMAIL', usedAt: null, expiresAt: { gt: new Date() } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      if (!record) return false;
      const expected = Buffer.from(record.tokenHash, 'hex');
      const supplied = Buffer.from(this.verificationHash(record.id, code), 'hex');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
      const changed = await tx.userToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() }, user: { disabledAt: null, emailVerifiedAt: null } }, data: { usedAt: new Date() } });
      if (changed.count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await tx.userToken.updateMany({ where: { userId: user.id, purpose: 'VERIFY_EMAIL', usedAt: null }, data: { usedAt: new Date() } });
      await this.audit.record(tx, { actorId: user.id, action: 'identity.email_verified', entityType: 'user', entityId: user.id });
      return true;
    });
    if (!verified) throw invalid();
    await this.redis.client.del(key);
    return { accepted: true };
  }
  async requestToken(email: string, purpose: TokenPurpose) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (user && !user.disabledAt && (purpose !== 'VERIFY_EMAIL' || !user.emailVerifiedAt)) await this.db.$transaction((tx) => this.issueToken(tx, user.id, email, purpose));
    return { accepted: true };
  }
  private async createSession(tx: Prisma.TransactionClient, userId: string, agent: string | undefined, familyId: string = randomUUID(), expiresAt = new Date(Date.now() + 30 * 86400000)) {
    const accessToken = token(); const refreshToken = token();
    const session = await tx.session.create({ data: { userId, familyId, refreshTokenHash: digest(refreshToken), accessTokenHash: digest(accessToken), accessExpiresAt: new Date(Date.now() + 15 * 60000), expiresAt, userAgent: agent?.slice(0, 512) }, include: { user: { select: publicUser } } });
    await this.audit.record(tx, { actorId: userId, action: 'identity.session_created', entityType: 'session', entityId: session.id });
    return { accessToken, refreshToken, user: session.user };
  }
  async login(email: string, password: string, agent?: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    const matches = await verifyPassword(password, user?.passwordHash ?? await this.dummyHash);
    if (!user || !matches || user.disabledAt) { await this.audit.record(this.db, { actorId: user?.id, action: 'identity.login_denied', entityType: 'user' }); throw invalid(); }
    if (!user.emailVerifiedAt) throw new ForbiddenException('EMAIL_UNVERIFIED');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      // Recheck credentials after locking against concurrent password reset/change.
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.passwordHash !== user.passwordHash || current.disabledAt) throw invalid();
      return this.createSession(tx, user.id, agent);
    });
  }
  async refresh(raw: string, agent?: string) {
    const hash = digest(raw);
    const previous = await this.db.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!previous) throw invalid();
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${previous.userId}::uuid FOR UPDATE`;
      const session = await tx.session.findUniqueOrThrow({ where: { id: previous.id }, include: { user: true } });
      if (session.revokedAt || session.rotatedAt) {
        await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.audit.record(tx, { actorId: session.userId, action: 'identity.refresh_replay', entityType: 'session', entityId: session.id });
        return null; // Commit family revocation before throwing outside transaction.
      }
      if (session.expiresAt <= new Date() || session.user.disabledAt || !session.user.emailVerifiedAt) return null;
      await tx.session.update({ where: { id: session.id }, data: { rotatedAt: new Date(), revokedAt: new Date() } });
      return this.createSession(tx, session.userId, agent, session.familyId, session.expiresAt);
    });
    if (!result) throw invalid();
    return result;
  }
  async logout(raw?: string) {
    if (raw) { const session = await this.db.session.findUnique({ where: { refreshTokenHash: digest(raw) } }); if (session) await this.db.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.userId}::uuid FOR UPDATE`; await tx.session.updateMany({ where: { familyId: session.familyId }, data: { revokedAt: new Date() } }); await this.audit.record(tx, { actorId: session.userId, action: 'identity.logged_out', entityType: 'session', entityId: session.id }); }); }
    return { loggedOut: true };
  }
  async updateProfile(userId: string, dto: ProfileDto) {
    return this.db.$transaction(async (tx) => { const user = await tx.user.update({ where: { id: userId }, data: { displayName: dto.displayName?.trim(), language: dto.language }, select: publicUser }); await this.audit.record(tx, { actorId: userId, action: 'identity.profile_updated', entityType: 'user', entityId: userId }); return user; });
  }
  async revokeSession(userId: string, sessionId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const session = await tx.session.findFirst({ where: { id: sessionId, userId } });
      if (session) { await tx.session.updateMany({ where: { familyId: session.familyId, userId }, data: { revokedAt: new Date() } }); await this.audit.record(tx, { actorId: userId, action: 'identity.session_revoked', entityType: 'session', entityId: sessionId }); }
    });
    return { revoked: true };
  }
  async consume(raw: string, purpose: TokenPurpose, password?: string) {
    const passwordHash = password ? await hashPassword(password) : undefined;
    const record = await this.db.userToken.findUnique({ where: { tokenHash: digest(raw) } });
    if (!record) throw invalid();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${record.userId}::uuid FOR UPDATE`;
      const changed = await tx.userToken.updateMany({ where: { id: record.id, purpose, usedAt: null, expiresAt: { gt: new Date() }, user: { disabledAt: null } }, data: { usedAt: new Date() } });
      if (changed.count !== 1) throw invalid();
      await tx.user.update({ where: { id: record.userId }, data: purpose === 'VERIFY_EMAIL' ? { emailVerifiedAt: new Date() } : { passwordHash } });
      await tx.userToken.updateMany({ where: { userId: record.userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
      if (purpose === 'RESET_PASSWORD') await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, { actorId: record.userId, action: purpose === 'RESET_PASSWORD' ? 'identity.password_reset' : 'identity.email_verified', entityType: 'user', entityId: record.userId });
    });
    return { accepted: true };
  }
  async changePassword(userId: string, currentPassword: string, password: string) {
    const next = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.passwordHash || !await verifyPassword(currentPassword, user.passwordHash)) throw invalid();
      await tx.user.update({ where: { id: userId }, data: { passwordHash: next } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, { actorId: userId, action: 'identity.password_changed', entityType: 'user', entityId: userId });
    }, { timeout: 10000 });
    return { accepted: true };
  }
  async oauthLogin(subject: string, email: string, name: string, agent?: string) {
    return this.db.$transaction(async (tx) => {
      let identity = await tx.oAuthIdentity.findUnique({ where: { provider_providerSubject: { provider: 'google', providerSubject: subject } }, include: { user: true } });
      if (!identity) {
        // Never implicitly link to an existing password account by matching email.
        if (await tx.user.findUnique({ where: { email } })) throw new ConflictException('Sign in with your existing account');
        identity = await tx.oAuthIdentity.create({ data: { provider: 'google', providerSubject: subject, user: { create: { email, displayName: name.slice(0, 100), emailVerifiedAt: new Date() } } }, include: { user: true } });
      }
      if (identity.user.disabledAt) throw invalid();
      return this.createSession(tx, identity.userId, agent);
    });
  }
}
