import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { IdentityModule } from '../identity/identity.module';
import { CreditsModule } from '../credits/credits.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { BillingService } from './billing.service';
import { AdminBillingController, PublicPlansController, WorkspaceBillingController } from './billing.controller';

@Module({ imports: [WorkspaceModule, IdentityModule, CreditsModule, CatalogModule, MediaModule], providers: [BillingService], controllers: [PublicPlansController, WorkspaceBillingController, AdminBillingController] })
export class BillingModule {}
