import { Controller, Get, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('surveys')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * GET /surveys/:id/analytics/descriptive?questionId=xxx
   * 取得評分題的描述統計（平均、中位數、眾數、標準差）
   * 若不傳 questionId，回傳所有評分題的統計
   */
  @Get(':id/analytics/descriptive')
  async getDescriptiveStats(
    @Param('id') surveyId: string,
    @Req() req: Request,
    @Query('questionId') questionId?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    if (questionId) {
      return this.analytics.getDescriptiveStats(surveyId, user.id, questionId);
    }
    return this.analytics.getAllDescriptiveStats(surveyId, user.id);
  }

  /**
   * GET /surveys/:id/analytics/cross-tab?questionA=xxx&questionB=yyy
   * 兩個單選題的交叉分析表 + Cramér's V
   */
  @Get(':id/analytics/cross-tab')
  async getCrossTab(
    @Param('id') surveyId: string,
    @Req() req: Request,
    @Query('questionA') questionA?: string,
    @Query('questionB') questionB?: string,
  ) {
    if (!questionA || !questionB) {
      throw new BadRequestException('必須提供 questionA 和 questionId 參數');
    }
    const user = req.user as AuthenticatedUser;
    return this.analytics.getCrossTab(surveyId, user.id, questionA, questionB);
  }

  /**
   * GET /surveys/:id/analytics/nps?questionId=xxx
   * NPS 淨推薦值（評分題轉 NPS）
   */
  @Get(':id/analytics/nps')
  async getNps(
    @Param('id') surveyId: string,
    @Req() req: Request,
    @Query('questionId') questionId?: string,
  ) {
    if (!questionId) {
      throw new BadRequestException('必須提供 questionId 參數');
    }
    const user = req.user as AuthenticatedUser;
    return this.analytics.getNps(surveyId, user.id, questionId);
  }

  /**
   * GET /surveys/:id/analytics/correlation?questionA=xxx&questionB=yyy
   * 兩個評分題的 Pearson 相關係數
   */
  @Get(':id/analytics/correlation')
  async getCorrelation(
    @Param('id') surveyId: string,
    @Req() req: Request,
    @Query('questionA') questionA?: string,
    @Query('questionB') questionB?: string,
  ) {
    if (!questionA || !questionB) {
      throw new BadRequestException('必須提供 questionA 和 questionB 參數');
    }
    const user = req.user as AuthenticatedUser;
    return this.analytics.getCorrelation(surveyId, user.id, questionA, questionB);
  }

  /**
   * GET /surveys/:id/analytics/segmentation?k=3
   * 回答者分群分析
   */
  @Get(':id/analytics/segmentation')
  async getSegmentation(
    @Param('id') surveyId: string,
    @Req() req: Request,
    @Query('k') k?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.analytics.getSegmentation(surveyId, user.id, k ? parseInt(k, 10) : 3);
  }
}
