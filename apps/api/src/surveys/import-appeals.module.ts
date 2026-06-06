import { Module } from '@nestjs/common';
import { ImportAppealsService } from './import-appeals.service';
import { ImportAppealsController, AdminImportAppealsController } from './import-appeals.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [NotificationsModule],
  controllers: [ImportAppealsController, AdminImportAppealsController],
  providers: [ImportAppealsService, AdminGuard],
})
export class ImportAppealsModule {}
