import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
@Module({ imports: [IdentityModule, WorkspaceModule], providers: [CatalogService], controllers: [CatalogController], exports: [CatalogService] })
export class CatalogModule {}
