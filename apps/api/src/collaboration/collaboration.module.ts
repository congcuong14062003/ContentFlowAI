import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { NotificationModule } from '../notifications/notification.module';
import { CollaborationController } from './collaboration.controller';
import { CollaborationService } from './collaboration.service';
@Module({imports:[IdentityModule,WorkspaceModule,NotificationModule],controllers:[CollaborationController],providers:[CollaborationService]})export class CollaborationModule{}
