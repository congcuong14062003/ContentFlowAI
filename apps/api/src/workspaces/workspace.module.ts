import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController, AcceptInvitationController } from './workspace.controller';
@Module({ imports: [IdentityModule], providers: [WorkspaceService], exports: [WorkspaceService], controllers: [WorkspaceController, AcceptInvitationController] })
export class WorkspaceModule {}
