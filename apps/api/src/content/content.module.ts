import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { IdentityModule } from '../identity/identity.module';
import { ContentDraftService } from './content-draft.service';
import { ContentEditorService } from './content-editor.service';
import { ContentEditorController } from './content-editor.controller';
@Module({ imports: [WorkspaceModule, IdentityModule], providers: [ContentDraftService, ContentEditorService], controllers: [ContentEditorController], exports: [ContentDraftService, ContentEditorService] })
export class ContentModule {}
