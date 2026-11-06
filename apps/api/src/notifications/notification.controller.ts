import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthRequest } from '../identity/auth.guard';
import { NotificationService } from './notification.service';
import { NotificationPreferenceDto, NotificationQuery } from './notification.dto';

@Controller('notifications') @UseGuards(AuthGuard)
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly service:NotificationService){}
  @Get() list(@Req() r:AuthRequest,@Query() q:NotificationQuery){return this.service.list(r.principal.id,q);}
  @Get('unread-count') count(@Req() r:AuthRequest){return this.service.count(r.principal.id).then(count=>({count}));}
  @Get('preferences') preferences(@Req() r:AuthRequest){return this.service.preferences(r.principal.id);}
  @Patch('preferences') setPreferences(@Req() r:AuthRequest,@Body() dto:NotificationPreferenceDto){return this.service.setPreferences(r.principal.id,dto);}
  @Post('read-all') all(@Req() r:AuthRequest){return this.service.markAllRead(r.principal.id);}
  @Patch(':id/:action') state(@Req() r:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Param('action') action:string){if(!['read','unread','archive','restore','delete'].includes(action))throw new NotFoundException();return this.service.state(r.principal.id,id,action as 'read'|'unread'|'archive'|'restore'|'delete');}
  @Get('stream') async stream(@Req() r:AuthRequest,@Res() response:Response){
    const userId=r.principal.id;const sessionId=r.principal.sessionId;
    response.setHeader('Content-Type','text/event-stream');response.setHeader('Cache-Control','no-cache, no-transform');response.setHeader('Connection','keep-alive');response.setHeader('X-Accel-Buffering','no');response.flushHeaders();
    response.write('event: ready\ndata: {}\n\n');
    const unsubscribe=this.service.subscribe(userId,id=>{if(id==='reset'){if(!response.writableEnded)response.write('event: reset\ndata: {}\n\n');return;}void this.service.visibleEvent(userId,id).then(event=>{if(event&&!response.writableEnded)response.write(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);}).catch(()=>undefined);});
    const timer=setInterval(()=>{void this.service.sessionValid(sessionId,userId).then(valid=>{if(!valid){response.end();return;}if(!response.writableEnded)response.write(': heartbeat\n\n');}).catch(()=>response.end());},30000);
    response.on('close',()=>{clearInterval(timer);unsubscribe();});
  }
}
