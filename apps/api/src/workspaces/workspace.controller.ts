import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, Query } from '@nestjs/common';
import { PageQuery } from '../common/pagination';
import { AuthGuard, AuthRateGuard, type AuthRequest } from '../identity/auth.guard';
import { TokenDto } from '../identity/identity.dto';
import { WorkspaceService } from './workspace.service';
import { InvitationDto, RoleDto, WorkspaceDto } from './workspace.dto';
@Controller('workspaces') @UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly service: WorkspaceService) {}
  @Get() list(@Req() r: AuthRequest, @Query() query: PageQuery) { return this.service.list(r.principal.id, query); }
  @Post() create(@Req() r: AuthRequest, @Body() dto: WorkspaceDto) { return this.service.create(r.principal.id, dto.name, String(r.id)); }
  @Get(':id') get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(id, r.principal.id); }
  @Patch(':id') update(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkspaceDto) { return this.service.update(id, r.principal.id, dto.name, String(r.id)); }
  @Get(':id/members') members(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: PageQuery) { return this.service.members(id, r.principal.id, query); }
  @Patch(':id/members/:userId') role(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: RoleDto) { return this.service.changeRole(id, r.principal.id, userId, dto.role, String(r.id)); }
  @Delete(':id/members/:userId') remove(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.service.remove(id, r.principal.id, userId, String(r.id)); }
  @Get(':id/invitations') invitations(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: PageQuery) { return this.service.invitations(id, r.principal.id, query); }
  @Post(':id/invitations') @UseGuards(AuthRateGuard) invite(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InvitationDto) { return this.service.invite(id, r.principal.id, dto, String(r.id)); }
  @Delete(':id/invitations/:invitationId') revoke(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Param('invitationId', ParseUUIDPipe) invitationId: string) { return this.service.revoke(id, r.principal.id, invitationId, String(r.id)); }
}
@Controller('invitations') @UseGuards(AuthGuard)
export class AcceptInvitationController {
  constructor(@Inject(WorkspaceService) private readonly service: WorkspaceService) {}
  @Post('accept') accept(@Req() r: AuthRequest, @Body() dto: TokenDto) { return this.service.accept(dto.token, r.principal, String(r.id)); }
}
