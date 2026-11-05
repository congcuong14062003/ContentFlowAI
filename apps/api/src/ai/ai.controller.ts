import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, SuperAdminGuard, type AuthRequest } from '../identity/auth.guard';
import { AiGatewayService } from './ai-gateway.service';
import { AiPolicyService } from './ai-policy.service';
import { ProviderRegistry } from './provider-registry.service';
import { EstimateDto, ReconcileGenerationDto } from './ai.dto';
import { PolicyDto } from '../credits/credits.dto';
import { PageQuery } from '../common/pagination';
@Controller('workspaces/:workspaceId/ai') @UseGuards(AuthGuard)
export class AiController {
  constructor(@Inject(AiGatewayService) private readonly gateway: AiGatewayService) {}
  @Post('estimate') @UseGuards(AuthRateGuard) estimate(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: EstimateDto) { return this.gateway.estimate(w, r.principal.id, dto); }
  @Get('usage') history(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() query: PageQuery) { return this.gateway.history(w, r.principal.id, query); }
}
@Controller('admin') @UseGuards(AuthGuard, SuperAdminGuard, AuthRateGuard)
export class AiAdminController {
  constructor(@Inject(AiGatewayService) private readonly gateway: AiGatewayService, @Inject(AiPolicyService) private readonly policy: AiPolicyService, @Inject(ProviderRegistry) private readonly registry: ProviderRegistry) {}
  @Put('ai/policy') global(@Req() r: AuthRequest, @Body() dto: PolicyDto) { return this.policy.configure(r.principal.id, dto); }
  @Put('workspaces/:workspaceId/ai/policy') workspace(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: PolicyDto) { return this.policy.configure(r.principal.id, dto, w); }
  @Post('workspaces/:workspaceId/ai/reconcile/:generationId') reconcile(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('generationId', ParseUUIDPipe) id: string, @Body() dto: ReconcileGenerationDto) { return this.gateway.resolve(w, r.principal.id, id, dto); }
  @Get('ai/providers') async health() { return { routes: this.registry.publicRoutes(), providers: await this.registry.refreshHealth() }; }
}
