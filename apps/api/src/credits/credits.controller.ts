import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, SuperAdminGuard, type AuthRequest } from '../identity/auth.guard';
import { CreditsService } from './credits.service';
import { AdjustmentDto, EvidenceDto, GrantDto } from './credits.dto';
import { PageQuery } from '../common/pagination';
@Controller('workspaces/:workspaceId/credits') @UseGuards(AuthGuard)
export class CreditsController {
  constructor(@Inject(CreditsService) private readonly credits: CreditsService) {}
  @Get('balance') balance(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.credits.balance(w, r.principal.id); }
  @Get('ledger') ledger(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: PageQuery) { return this.credits.ledger(w, r.principal.id, q); }
  @Get('grants') grants(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: PageQuery) { return this.credits.grants(w, r.principal.id, q); }
}
@Controller('admin/workspaces/:workspaceId/credits') @UseGuards(AuthGuard, SuperAdminGuard, AuthRateGuard)
export class CreditAdminController {
  constructor(@Inject(CreditsService) private readonly credits: CreditsService) {}
  @Post('grants') grant(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: GrantDto) { return this.credits.adminGrant(w, r.principal.id, dto); }
  @Post('adjustments') adjust(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: AdjustmentDto) { return this.credits.adjust(w, r.principal.id, dto); }
  @Post('refunds/:generationId') refund(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('generationId', ParseUUIDPipe) id: string, @Body() dto: EvidenceDto) { return this.credits.refund(w, r.principal.id, id, dto.evidence); }
  @Post('reconcile') reconcile(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.credits.reconcile(w, r.principal.id); }
}
