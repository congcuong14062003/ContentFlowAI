import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Delete, Req, Res, UseGuards, BadRequestException, Query } from '@nestjs/common';
import { cursorPage, pageRange, PageQuery } from '../common/pagination';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { IdentityService } from './identity.service';
import { AuthGuard, AuthRateGuard, type AuthRequest, OriginGuard, SuperAdminGuard } from './auth.guard';
import { EmailDto, LoginDto, PasswordDto, ProfileDto, RegisterDto, ResetDto, TokenDto, VerificationCodeDto } from './identity.dto';
import { cookieOptions, readCookie, sessionResponse } from './cookies';
import { GoogleOAuthService } from './oauth.service';
import { PrismaService } from '../platform/prisma.service';

@Controller('auth')
@UseGuards(AuthRateGuard)
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService, @Inject(ConfigService) private readonly config: ConfigService, @Inject(GoogleOAuthService) private readonly google: GoogleOAuthService) {}
  private get production() { return this.config.get<string>('NODE_ENV') === 'production'; }
  @Post('register') register(@Body() dto: RegisterDto) { return this.identity.register(dto); }
  @Post('login') @HttpCode(200) @UseGuards(OriginGuard)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) { return sessionResponse(response, this.production, await this.identity.login(dto.email, dto.password, request.headers['user-agent'])); }
  @Post('refresh') @HttpCode(200) @UseGuards(OriginGuard)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return sessionResponse(response, this.production, await this.identity.refresh(readCookie(request, 'cf_refresh') ?? '', request.headers['user-agent']));
  }
  @Post('logout') @HttpCode(200) @UseGuards(OriginGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { response.clearCookie('cf_refresh', cookieOptions(this.production)); return this.identity.logout(readCookie(request, 'cf_refresh')); }
  @Post('verify-email') @HttpCode(200) verify(@Body() dto: VerificationCodeDto) { return this.identity.consumeVerificationCode(dto.email, dto.code); }
  @Post('verify-email-link') @HttpCode(200) verifyLegacyLink(@Body() dto: TokenDto) { return this.identity.consume(dto.token, 'VERIFY_EMAIL'); }
  @Post('resend-verification') @HttpCode(200) resend(@Body() dto: EmailDto) { return this.identity.requestToken(dto.email, 'VERIFY_EMAIL'); }
  @Post('forgot-password') @HttpCode(200) forgot(@Body() dto: EmailDto) { return this.identity.requestToken(dto.email, 'RESET_PASSWORD'); }
  @Post('reset-password') @HttpCode(200) reset(@Body() dto: ResetDto) { return this.identity.consume(dto.token, 'RESET_PASSWORD', dto.password); }
  @Get('options') options() { return { google: this.google.enabled() }; }
  @Get('google')
  async googleStart(@Res() response: Response) { const result = await this.google.start(); response.cookie('cf_oauth_state', result.state, { ...cookieOptions(this.production), maxAge: 300000 }); response.redirect(result.url); }
  @Get('google/callback')
  async googleCallback(@Req() request: Request, @Res() response: Response) {
    const state = request.query.state; const code = request.query.code;
    response.clearCookie('cf_oauth_state', cookieOptions(this.production));
    if (typeof state !== 'string' || typeof code !== 'string' || readCookie(request, 'cf_oauth_state') !== state) throw new BadRequestException('Invalid OAuth state');
    const identity = await this.google.callback(code, state);
    sessionResponse(response, this.production, await this.identity.oauthLogin(identity.subject, identity.email, identity.name, request.headers['user-agent']));
    response.redirect(`${this.config.get<string>('WEB_ORIGIN')}/login?oauth=1`);
  }
}

@Controller('users/me') @UseGuards(AuthGuard)
export class UserController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(IdentityService) private readonly identity: IdentityService) {}
  @Get() me(@Req() request: AuthRequest) { const user = request.principal; return { id: user.id, email: user.email, displayName: user.displayName, language: user.language, systemRole: user.systemRole, emailVerifiedAt: user.emailVerifiedAt }; }
  @Patch() profile(@Req() request: AuthRequest, @Body() dto: ProfileDto) { return this.identity.updateProfile(request.principal.id, dto); }
  @Post('password') @HttpCode(200) @UseGuards(AuthRateGuard) password(@Req() request: AuthRequest, @Body() dto: PasswordDto) { return this.identity.changePassword(request.principal.id, dto.currentPassword, dto.password); }
  @Get('sessions') async sessions(@Req() request: AuthRequest, @Query() query: PageQuery) {
    const scope = `sessions:${request.principal.id}`;
    const rows = await this.db.session.findMany({ where: { userId: request.principal.id, revokedAt: null, expiresAt: { gt: new Date() }, ...pageRange(query, scope, true) }, select: { id: true, userAgent: true, createdAt: true, expiresAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
    return { ...cursorPage(rows, query, scope), currentSessionId: request.principal.sessionId };
  }
  @Delete('sessions/:id') revoke(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.identity.revokeSession(request.principal.id, id); }
}
@Controller('admin') @UseGuards(AuthGuard, SuperAdminGuard)
export class AdminController { @Get('access') access() { return { allowed: true }; } }
