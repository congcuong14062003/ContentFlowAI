import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnvironment } from './config/environment';
import { PlatformModule } from './platform/platform.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { WorkspaceModule } from './workspaces/workspace.module';
import { CatalogModule } from './catalog/catalog.module';
import { CreditsModule } from './credits/credits.module';
import { AiModule } from './ai/ai.module';
import { GeneratorModule } from './generator/generator.module';
import { ContentModule } from './content/content.module';
import { CampaignModule } from './campaigns/campaign.module';
import { MediaModule } from './media/media.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { FinanceModule } from './finance/finance.module';
import { SupportModule } from './support/support.module';
import { NotificationModule } from './notifications/notification.module';
import { CollaborationModule } from './collaboration/collaboration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment, envFilePath: ['.env', '../../.env'] }),
    LoggerModule.forRoot({ forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }], pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      genReqId: (request, response) => {
        const supplied = request.headers['x-request-id'];
        const id = request.id ? String(request.id) : (typeof supplied === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID());
        response.setHeader('x-request-id', id);
        return id;
      },
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0] }) }
    } }),
    PlatformModule, IdentityModule, NotificationModule, WorkspaceModule, CollaborationModule, CatalogModule, CreditsModule, AiModule, GeneratorModule, ContentModule, CampaignModule, MediaModule, BillingModule, AdminModule, FinanceModule, SupportModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
