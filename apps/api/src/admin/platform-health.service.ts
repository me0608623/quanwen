import { Injectable, Logger } from '@nestjs/common';
import { ZaiClient } from '../ai-audit/zai.client';
import { parsePlatformHealth } from '../ai-audit/schemas';
import { PLATFORM_HEALTH } from '../ai-audit/prompts';

export interface PlatformHealthSummary {
  status: 'healthy' | 'attention' | 'critical';
  headline: string;            // 1 句話總結
  highlights: string[];        // 正面指標
  concerns: string[];          // 需注意項
  suggestedActions: string[];  // 建議行動
  generatedAt: string;
}

interface StatsInput {
  totalUsers: number;
  totalSurveyors: number;
  totalRespondents: number;
  surveyCounts: Record<string, number>;
  totalResponses: number;
  suspiciousResponses: number;
  platformRevenue: number;
  platformRevenueThisMonth: number;
}

@Injectable()
export class PlatformHealthService {
  private readonly logger = new Logger(PlatformHealthService.name);
  constructor(private readonly zai: ZaiClient) {}

  async summarize(stats: StatsInput): Promise<PlatformHealthSummary> {
    const prompt = this.buildPrompt(stats);
    try {
      // Phase II.5: prompt 從 registry 取
      const raw = await this.zai.jsonChat<unknown>(
        PLATFORM_HEALTH.system,
        prompt,
        {
          temperature: 0.3,
          promptKey: PLATFORM_HEALTH.key,
          promptVersion: PLATFORM_HEALTH.version,
        },
      );
      const result = parsePlatformHealth(raw);
      return {
        ...result,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('AI 平台摘要失敗，回退規則式分析', err);
      return this.fallback(stats);
    }
  }

  private buildPrompt(stats: StatsInput): string {
    const pending = stats.surveyCounts.pending_review ?? 0;
    const published = stats.surveyCounts.published ?? 0;
    const rejected = stats.surveyCounts.rejected ?? 0;
    return [
      '請以平台營運主管的角度，分析目前平台健康度：',
      '',
      `總用戶數：${stats.totalUsers}（問券方 ${stats.totalSurveyors} / 受試者 ${stats.totalRespondents}）`,
      '',
      '問卷狀態分佈：',
      `  - 待審核：${pending}`,
      `  - 已上架：${published}`,
      `  - 已拒絕：${rejected}`,
      `  - 草稿：${stats.surveyCounts.draft ?? 0}`,
      `  - 已關閉：${stats.surveyCounts.closed ?? 0}`,
      '',
      '填答數據：',
      `  - 總填答數：${stats.totalResponses}`,
      `  - 可疑填答：${stats.suspiciousResponses}（${stats.totalResponses > 0 ? Math.round((stats.suspiciousResponses / stats.totalResponses) * 100) : 0}%）`,
      '',
      '平台收入（手續費）：',
      `  - 本月：NT$${stats.platformRevenueThisMonth}`,
      `  - 累計：NT$${stats.platformRevenue}`,
      '',
      '請回傳 JSON：',
      '{',
      '  "status": "healthy" | "attention" | "critical",',
      '  "headline": "1 句話總結",',
      '  "highlights": ["正面指標 1", "正面指標 2"],',
      '  "concerns": ["需注意項 1", "需注意項 2"],',
      '  "suggestedActions": ["建議行動 1", "建議行動 2"]',
      '}',
      '',
      '判斷準則：',
      '- 可疑填答比例 > 20%：critical',
      '- 待審核問卷 ≥ 5 件 或 受試者 < 問券方數：attention',
      '- 否則：healthy',
    ].join('\n');
  }

  private fallback(stats: StatsInput): PlatformHealthSummary {
    const pending = stats.surveyCounts.pending_review ?? 0;
    const suspRatio =
      stats.totalResponses > 0 ? stats.suspiciousResponses / stats.totalResponses : 0;
    const status: 'healthy' | 'attention' | 'critical' =
      suspRatio > 0.2 ? 'critical' : pending >= 5 ? 'attention' : 'healthy';

    const highlights: string[] = [];
    if (stats.totalUsers > 0) highlights.push(`平台已累積 ${stats.totalUsers} 位用戶`);
    if (stats.platformRevenueThisMonth > 0)
      highlights.push(`本月手續費收入 NT$${stats.platformRevenueThisMonth}`);
    if (stats.totalResponses > 0) highlights.push(`累計填答 ${stats.totalResponses} 份`);

    const concerns: string[] = [];
    if (pending > 0) concerns.push(`${pending} 份問卷待審核`);
    if (stats.suspiciousResponses > 0)
      concerns.push(`${stats.suspiciousResponses} 筆可疑填答待處理`);

    return {
      status,
      headline:
        status === 'critical'
          ? '可疑填答比例偏高，建議立即介入處理'
          : status === 'attention'
            ? '平台運作正常，但有待處理項目'
            : '平台運作健康，各項指標良好',
      highlights,
      concerns,
      suggestedActions: [
        pending > 0 ? '處理待審問卷以提升上架速度' : '',
        stats.suspiciousResponses > 0 ? '審查可疑填答以維護資料品質' : '',
        stats.totalRespondents < stats.totalSurveyors * 5
          ? '加強受試者招募以平衡供需'
          : '',
      ].filter(Boolean),
      generatedAt: new Date().toISOString(),
    };
  }
}
