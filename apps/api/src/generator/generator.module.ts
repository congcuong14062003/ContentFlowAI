import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { IdentityModule } from '../identity/identity.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AiModule } from '../ai/ai.module';
import { CreditsModule } from '../credits/credits.module';
import { ContentModule } from '../content/content.module';
import { GeneratorService } from './generator.service';
import { GeneratorController } from './generator.controller';
@Module({ imports: [WorkspaceModule, IdentityModule, CatalogModule, AiModule, CreditsModule, ContentModule], providers: [GeneratorService], controllers: [GeneratorController] })
export class GeneratorModule {}
