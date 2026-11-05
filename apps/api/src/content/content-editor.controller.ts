import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthRequest } from '../identity/auth.guard';
import { PageQuery } from '../common/pagination';
import { ContentEditorService } from './content-editor.service';
import { RestoreContentDto, SaveContentDto } from './content-editor.dto';
@Controller('workspaces/:workspaceId/content') @UseGuards(AuthGuard)
export class ContentEditorController {
  constructor(@Inject(ContentEditorService) private readonly service: ContentEditorService) {}
  @Get() list(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: PageQuery) { return this.service.list(w, r.principal.id, q); }
  @Get(':id') read(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.read(w, r.principal.id, id); }
  @Get(':id/revisions') revisions(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.revisions(w, r.principal.id, id); }
  @Put(':id') save(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveContentDto) { return this.service.save(w, r.principal.id, id, dto); }
  @Post(':id/restore') restore(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RestoreContentDto) { return this.service.restore(w, r.principal.id, id, dto); }
}
