import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { IdentityModule } from '../identity/identity.module';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsService } from './credits.service';
import { CreditAdminController, CreditsController } from './credits.controller';
@Module({ imports: [WorkspaceModule, IdentityModule], providers: [CreditWalletService, CreditsService], exports: [CreditWalletService, CreditsService], controllers: [CreditsController, CreditAdminController] })
export class CreditsModule {}
