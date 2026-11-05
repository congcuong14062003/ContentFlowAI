import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({ imports: [IdentityModule, WorkspaceModule], controllers: [MediaController], providers: [MediaService], exports: [MediaService] })
export class MediaModule {}
