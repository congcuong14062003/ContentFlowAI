import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, SuperAdminGuard, type AuthRequest } from '../identity/auth.guard';
import { SupportService } from './support.service';
import { CreateTicketDto, ReplyDto, TicketQuery, UpdateTicketDto } from './support.dto';

@Controller('workspaces/:workspaceId/support') @UseGuards(AuthGuard)
export class WorkspaceSupportController {
  constructor(@Inject(SupportService) private readonly service: SupportService) {}
  @Get() list(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Query() q:TicketQuery){return this.service.list(w,r.principal.id,false,q);}
  @Post() @UseGuards(AuthRateGuard) create(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Body() dto:CreateTicketDto){return this.service.create(w,r.principal.id,dto);}
  @Get(':id') detail(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string){return this.service.detail(w,id,r.principal.id,false);}
  @Post(':id/replies') @UseGuards(AuthRateGuard) reply(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReplyDto){return this.service.reply(w,id,r.principal.id,false,dto);}
}
@Controller('admin/support') @UseGuards(AuthGuard,SuperAdminGuard)
export class AdminSupportController {
  constructor(@Inject(SupportService) private readonly service: SupportService) {}
  @Get() list(@Req() r: AuthRequest,@Query() q:TicketQuery){return this.service.list(null,r.principal.id,true,q);}
  @Get(':workspaceId/:id') detail(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string){return this.service.detail(w,id,r.principal.id,true);}
  @Patch(':workspaceId/:id') update(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateTicketDto){return this.service.update(w,id,r.principal.id,dto);}
  @Post(':workspaceId/:id/replies') @UseGuards(AuthRateGuard) reply(@Req() r: AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReplyDto){return this.service.reply(w,id,r.principal.id,true,dto);}
}
@Controller('support/notifications') @UseGuards(AuthGuard)
export class SupportNotificationController {
  constructor(@Inject(SupportService) private readonly service: SupportService) {}
  @Get() list(@Req() r: AuthRequest){return this.service.notifications(r.principal.id);}
  @Patch(':id/read') read(@Req() r: AuthRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.markRead(r.principal.id,id);}
}
