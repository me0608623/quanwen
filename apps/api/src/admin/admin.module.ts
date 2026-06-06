import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';
import { SuspiciousAnalyzerService } from './suspicious-analyzer.service';
import { PlatformHealthService } from './platform-health.service';
import { WithdrawalRiskService } from './withdrawal-risk.service';
import { MultiAccountDetectorService } from './multi-account-detector.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiAuditModule } from '../ai-audit/ai-audit.module';
// Phase I 修：WalletModule + ResponsesModule 用 require() 動態載入，
// 避免 responses→wallet→kyc→admin→responses 的 4-module 靜態 import 環造成 TDZ 錯誤。
// （forwardRef 只解決 metadata-resolution 順序，沒解決 JS module-graph 環）

@Module({
  imports: [
    NotificationsModule,
    AiAuditModule,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    forwardRef(() => require('../wallet/wallet.module').WalletModule),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    forwardRef(() => require('../responses/responses.module').ResponsesModule),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    forwardRef(() => require('../mutual/mutual.module').MutualModule),
  ],
  controllers: [AdminController, AdminUsersController, AdminAuditController],
  providers: [
    AdminService,
    AdminUsersService,
    AdminAuditService,
    SuspiciousAnalyzerService,
    PlatformHealthService,
    WithdrawalRiskService,
    MultiAccountDetectorService,
  ],
  exports: [MultiAccountDetectorService],
})
export class AdminModule {}
