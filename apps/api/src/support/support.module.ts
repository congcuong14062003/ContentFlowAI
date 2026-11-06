import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { NotificationModule } from '../notifications/notification.module';
import { AdminSupportController, SupportNotificationController, WorkspaceSupportController } from './support.controller';
import { SupportService } from './support.service';
@Module({imports:[IdentityModule,WorkspaceModule,NotificationModule],controllers:[WorkspaceSupportController,AdminSupportController,SupportNotificationController],providers:[SupportService]}) export class SupportModule {}
