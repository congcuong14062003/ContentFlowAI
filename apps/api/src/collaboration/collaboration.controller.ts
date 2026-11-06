import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRateGuard, type AuthRequest } from '../identity/auth.guard';
import { PageQuery } from '../common/pagination';
import { ActivityQuery, AssignmentDto, CommentDto } from './collaboration.dto';
import { CollaborationService } from './collaboration.service';
@Controller('workspaces/:workspaceId') @UseGuards(AuthGuard)
export class CollaborationController {
  constructor(@Inject(CollaborationService) private readonly service:CollaborationService){}
  @Patch('content/:id/assignment') assign(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:AssignmentDto){return this.service.assign(w,id,r.principal.id,dto);}
  @Get('content/:id/comments') comments(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Query() q:PageQuery){return this.service.comments(w,id,r.principal.id,q);}
  @Post('content/:id/comments') @UseGuards(AuthRateGuard) comment(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CommentDto){return this.service.comment(w,id,r.principal.id,dto);}
  @Get('content/:id/activity') timeline(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('id',ParseUUIDPipe) id:string,@Query() q:PageQuery){return this.service.timeline(w,id,r.principal.id,q);}
  @Get('activity') teamActivity(@Req() r:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Query() q:ActivityQuery){return this.service.teamActivity(w,r.principal.id,q);}
}
