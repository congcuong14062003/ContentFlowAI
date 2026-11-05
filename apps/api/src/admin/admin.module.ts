import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AdminService } from './admin.service';
import { AdminDashboardController } from './admin.controller';
@Module({ imports: [IdentityModule], providers: [AdminService], controllers: [AdminDashboardController] })
export class AdminModule {}
