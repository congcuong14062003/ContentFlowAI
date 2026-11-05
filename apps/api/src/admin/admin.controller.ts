import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, SuperAdminGuard, type AuthRequest } from '../identity/auth.guard';
import { AdminService } from './admin.service';
import { AccountStatusDto, AdminAiUsageQuery, AdminUsersQuery } from './admin.dto';

@Controller('admin') @UseGuards(AuthGuard, SuperAdminGuard)
export class AdminDashboardController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Get('overview') overview(@Req() r: AuthRequest) { return this.service.overview(r.principal.id); }
  @Get('users') users(@Req() r: AuthRequest, @Query() query: AdminUsersQuery) { return this.service.users(r.principal.id, query); }
  @Get('ai/usage') aiUsage(@Req() r: AuthRequest, @Query() query: AdminAiUsageQuery) { return this.service.aiUsage(r.principal.id, query); }
  @Get('users/:id') user(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.user(r.principal.id, id); }
  @Patch('users/:id/status') @UseGuards(AuthRateGuard) status(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AccountStatusDto) { return this.service.setAccountStatus(r.principal.id, id, dto); }
}
