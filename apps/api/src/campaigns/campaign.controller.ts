import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthRequest } from '../identity/auth.guard';
import { CampaignService } from './campaign.service';
import { AttachContentDto, CalendarQuery, CampaignDto, CampaignQuery, ScheduleDto, TransitionDto } from './campaign.dto';
@Controller('workspaces/:workspaceId') @UseGuards(AuthGuard)
export class CampaignController {
  constructor(@Inject(CampaignService) private readonly service: CampaignService) {}
  @Get('campaigns') list(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Query() q:CampaignQuery){return this.service.list(w,r.principal.id,q);}
  @Post('campaigns') create(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Body() dto:CampaignDto){return this.service.create(w,r.principal.id,dto);}
  @Get('campaigns/:id') detail(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string){return this.service.detail(w,r.principal.id,id);}
  @Put('campaigns/:id') update(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CampaignDto){return this.service.update(w,r.principal.id,id,dto);}
  @Post('campaigns/:id/contents') attach(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:AttachContentDto){return this.service.attach(w,r.principal.id,id,dto);}
  @Get('calendar') calendar(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Query() q:CalendarQuery){return this.service.calendar(w,r.principal.id,q);}
  @Patch('content/:id/workflow') transition(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:TransitionDto){return this.service.transition(w,r.principal.id,id,dto);}
  @Patch('content/:id/schedule') schedule(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ScheduleDto){return this.service.schedule(w,r.principal.id,id,dto);}
}
