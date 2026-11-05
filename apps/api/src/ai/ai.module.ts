import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CreditsModule } from '../credits/credits.module';
import { ProviderRegistry } from './provider-registry.service';
import { AiPolicyService } from './ai-policy.service';
import { AiGatewayService } from './ai-gateway.service';
import { AiAdminController, AiController } from './ai.controller';
@Module({ imports: [IdentityModule, WorkspaceModule, CatalogModule, CreditsModule], providers: [ProviderRegistry, AiPolicyService, AiGatewayService], exports: [AiGatewayService], controllers: [AiController, AiAdminController] })
export class AiModule {}
