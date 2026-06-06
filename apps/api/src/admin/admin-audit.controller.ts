import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const TransactionsQuerySchema = z.object({
  type: z.enum([
    'deposit', 'reward_out', 'reward_in', 'platform_fee',
    'withdraw_request', 'withdraw_complete', 'refund', 'points_in', 'points_spend',
  ]).optional(),
  status: z.enum(['pending', 'processing', 'success', 'failed', 'cancelled']).optional(),
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
type TransactionsQuery = z.infer<typeof TransactionsQuerySchema>;

const AiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
type AiUsageQuery = z.infer<typeof AiUsageQuerySchema>;

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminAudit: AdminAuditService) {}

  /** GET /admin/transactions — 交易稽核列表（type/status/userId 篩選 + 分頁 + 分類彙總） */
  @Get('transactions')
  listTransactions(@Query(new ZodValidationPipe(TransactionsQuerySchema)) query: TransactionsQuery) {
    return this.adminAudit.listTransactions(query);
  }

  /** GET /admin/ai-usage — AI 調用成本監控（zai_call_log 聚合，預設近 30 天） */
  @Get('ai-usage')
  getAiUsage(@Query(new ZodValidationPipe(AiUsageQuerySchema)) query: AiUsageQuery) {
    return this.adminAudit.getAiUsage(query.days);
  }
}
