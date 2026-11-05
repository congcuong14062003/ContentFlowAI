import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service'; import { MailService } from './mail.service';
import { AuthGuard, AuthRateGuard, OriginGuard, SuperAdminGuard } from './auth.guard';
import { IdentityController, UserController, AdminController } from './identity.controller';
import { GoogleOAuthService } from './oauth.service';
@Module({ providers: [IdentityService, MailService, AuthGuard, AuthRateGuard, OriginGuard, SuperAdminGuard, GoogleOAuthService], controllers: [IdentityController, UserController, AdminController], exports: [IdentityService, AuthGuard, AuthRateGuard, SuperAdminGuard, MailService] })
export class IdentityModule {}
