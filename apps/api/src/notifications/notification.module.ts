import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
@Module({imports:[IdentityModule],controllers:[NotificationController],providers:[NotificationService],exports:[NotificationService]})export class NotificationModule{}
