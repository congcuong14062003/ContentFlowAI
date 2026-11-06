import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { IdentityModule } from '../identity/identity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationModule } from '../notifications/notification.module';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
@Module({ imports:[WorkspaceModule,IdentityModule,CatalogModule,NotificationModule],controllers:[CampaignController],providers:[CampaignService],exports:[CampaignService] })
export class CampaignModule {}
