import { Body, Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, SuperAdminGuard, type AuthRequest } from '../identity/auth.guard';
import { FinanceService } from './finance.service';
import { CostEntryDto, FinanceQuery } from './finance.dto';
@Controller('admin/finance') @UseGuards(AuthGuard, SuperAdminGuard)
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly service: FinanceService) {}
  @Get() report(@Req() request: AuthRequest, @Query() query: FinanceQuery) { return this.service.report(request.principal.id, query); }
  @Get('costs') costs(@Req() request: AuthRequest, @Query() query: FinanceQuery) { return this.service.costs(request.principal.id,query); }
  @Post('costs') addCost(@Req() request: AuthRequest, @Body() dto: CostEntryDto) { return this.service.addCost(request.principal.id,dto); }
  @Get('export.csv') async csv(@Req() request: AuthRequest, @Query() query: FinanceQuery, @Res() response: Response) { const body=await this.service.csv(request.principal.id, query); response.type('text/csv; charset=utf-8').attachment('finance.csv').send(body); }
}
