import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, type AuthRequest } from '../identity/auth.guard';
import { GeneratorService } from './generator.service';
import { CreateRunDto, SaveVariationDto } from './generator.dto';
import { PageQuery } from '../common/pagination';
@Controller('workspaces/:workspaceId/generator') @UseGuards(AuthGuard)
export class GeneratorController {
  constructor(@Inject(GeneratorService) private readonly service: GeneratorService) {}
  @Get('tools') tools(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.service.gallery(w, r.principal.id); }
  @Post('quotes') @UseGuards(AuthRateGuard) quote(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() input: unknown) { return this.service.quote(w, r.principal.id, input); }
  @Post('runs') @HttpCode(202) @UseGuards(AuthRateGuard) create(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: CreateRunDto) { return this.service.create(w, r.principal.id, dto); }
  @Get('runs') history(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: PageQuery) { return this.service.history(w, r.principal.id, q); }
  @Get('runs/:id') detail(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(w, r.principal.id, id); }
  @Post('runs/:id/resume') @HttpCode(202) @UseGuards(AuthRateGuard) resume(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.resume(w, r.principal.id, id); }
  @Post('runs/:id/drafts') save(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveVariationDto) { return this.service.save(w, r.principal.id, id, dto.variationIndex); }
  @Get('drafts/:id') draft(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.readDraft(w, r.principal.id, id); }
}
