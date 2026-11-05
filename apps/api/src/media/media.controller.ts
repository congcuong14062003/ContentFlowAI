import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, AuthRateGuard, type AuthRequest } from '../identity/auth.guard';
import { MAX_IMAGE_SIZE, type ImageUpload } from '../catalog/image-validation';
import { FolderDto, MediaEditDto, MediaQuery } from './media.dto';
import { MediaService } from './media.service';

@Controller('workspaces/:workspaceId/media') @UseGuards(AuthGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}
  @Get('usage') usage(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.media.usage(w, r.principal.id); }
  @Get('folders') folders(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.media.folders(w, r.principal.id); }
  @Post('folders') createFolder(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: FolderDto) { return this.media.createFolder(w, r.principal.id, dto); }
  @Delete('folders/:id') removeFolder(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.media.removeFolder(w, r.principal.id, id); }
  @Get() list(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: MediaQuery) { return this.media.list(w, r.principal.id, q); }
  @Post() @UseGuards(AuthRateGuard) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 0, parts: 1 } }))
  upload(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query('folderId', new ParseUUIDPipe({ optional: true })) folderId: string | undefined, @UploadedFile() file?: ImageUpload) { return this.media.upload(w, r.principal.id, folderId, file); }
  @Patch(':id') edit(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MediaEditDto) { return this.media.edit(w, r.principal.id, id, dto); }
  @Get(':id/file') async file(@Req() r: AuthRequest, @Res() res: Response, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Query('download') download?: string) {
    const result = await this.media.file(w, r.principal.id, id);
    res.set({ 'Content-Type': result.mimeType, 'Content-Length': String(result.body.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': download === '1' ? `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}` : 'inline' }).send(result.body);
  }
  @Get(':id/thumbnail') async thumbnail(@Req() r: AuthRequest, @Res() res: Response, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.media.file(w, r.principal.id, id, true);
    res.set({ 'Content-Type': result.mimeType, 'Content-Length': String(result.body.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(result.body);
  }
  @Delete(':id') remove(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.media.remove(w, r.principal.id, id); }
}
