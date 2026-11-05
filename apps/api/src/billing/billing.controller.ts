import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, SuperAdminGuard, type AuthRequest } from '../identity/auth.guard';
import { PageQuery } from '../common/pagination';
import { BillingService } from './billing.service';
import { CancelSubscriptionDto, ManualConfirmDto, PlanActivationDto, PlanCreateDto, SubscribeDto } from './billing.dto';

@Controller('billing/plans')
export class PublicPlansController {
  constructor(@Inject(BillingService) private readonly service: BillingService) {}
  @Get() list() { return this.service.plans(); }
}

@Controller('workspaces/:workspaceId/billing') @UseGuards(AuthGuard)
export class WorkspaceBillingController {
  constructor(@Inject(BillingService) private readonly service: BillingService) {}
  @Get('subscription') current(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.service.current(w, r.principal.id); }
  @Post('subscriptions') @UseGuards(AuthRateGuard) subscribe(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: SubscribeDto) { return this.service.subscribe(w, r.principal.id, dto); }
  @Post('subscriptions/:id/cancel') cancel(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSubscriptionDto) { return this.service.cancel(w, r.principal.id, id, dto); }
  @Get('invoices') invoices(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: PageQuery) { return this.service.invoices(w, r.principal.id, q); }
}

@Controller('admin/billing') @UseGuards(AuthGuard, SuperAdminGuard, AuthRateGuard)
export class AdminBillingController {
  constructor(@Inject(BillingService) private readonly service: BillingService) {}
  @Get('plans') plans(@Req() r: AuthRequest) { return this.service.adminPlans(r.principal.id); }
  @Post('plans') create(@Req() r: AuthRequest, @Body() dto: PlanCreateDto) { return this.service.createPlan(r.principal.id, dto); }
  @Patch('plans/:id/activation') activate(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanActivationDto) { return this.service.activatePlan(r.principal.id, id, dto); }
  @Post('workspaces/:workspaceId/payments/:paymentId/confirm') confirm(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('paymentId', ParseUUIDPipe) id: string, @Body() dto: ManualConfirmDto) { return this.service.confirmManual(w, r.principal.id, id, dto); }
}
