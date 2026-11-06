import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationModule } from '../notifications/notification.module';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController, AcceptInvitationController } from './workspace.controller';
@Module({ imports: [IdentityModule,NotificationModule], providers: [WorkspaceService], exports: [WorkspaceService], controllers: [WorkspaceController, AcceptInvitationController] })
export class WorkspaceModule {}
