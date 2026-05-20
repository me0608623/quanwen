import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, surveyResponses } from '../db/schema';
import { ZaiClient } from '../ai-audit/zai.client';

export interface AssistantRecommendation {
  primaryAction: {
    label: string;            // 主要該做的事
    surveyId?: string;        // 相關的問卷（可選）
    surveyTitle?: string;
    reason: string;
  };
  insights: string[];         // 整體洞察
  alerts: Array<{
    severity: 'info' | 'warning';
    message: string;
    surveyId?: string;
  }>;
  generatedAt: string;
}

interface SurveyOverview {
  id: string;
  title: string;
  status: string;
  rewardPoints: number;
  targetCount: number;
  completedCount: number;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class SurveyorAssistantService {
  private readonly logger = new Logger(SurveyorAssistantService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly zai: ZaiClient,
  ) {}

  async recommend(surveyorId: string): Promise<AssistantRecommendation> {
    // 取 surveyor 的所有 surveys
    const ownSurveys = await this.db
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        rewardPoints: surveys.rewardPoints,
        targetCount: surveys.targetCount,
        completedCount: surveys.completedCount,
        expiresAt: surveys.expiresAt,
        createdAt: surveys.createdAt,
      })
      .from(surveys)
      .where(eq(surveys.surveyorId, surveyorId));

    // 各 survey 可疑填答數
    const suspiciousRows = ownSurveys.length === 0
      ? []
      : await this.db
          .select({
            surveyId: surveyResponses.surveyId,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(surveyResponses)
          .where(sql`${surveyResponses.antiCheatScore} >= 60`)
          .groupBy(surveyResponses.surveyId);

    const suspiciousMap = new Map(suspiciousRows.map((r) => [r.surveyId, r.count]));

    if (ownSurveys.length === 0) {
      return this.emptyState();
    }

    const prompt = this.buildPrompt(ownSurveys as SurveyOverview[], suspiciousMap);

    try {
      const result = await this.zai.jsonChat<Omit<AssistantRecommendation, 'generatedAt'>>(
        '你是問卷研究的 AI 助手。根據問券方的問卷狀態，給出 1 個最該優先處理的行動，' +
          '搭配 2-4 條整體洞察與 0-3 條警示。回繁體中文 JSON。' +
          'primaryAction.label 與 reason 各 ≤ 50 字。' +
          'severity 為 info 或 warning。禁編造資料。',
        prompt,
        { temperature: 0.4 },
      );
      return {
        ...result,
        insights: (result.insights ?? []).slice(0, 4),
        alerts: (result.alerts ?? []).slice(0, 3),
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('SurveyorAssistant LLM failed', err);
      return this.fallback(ownSurveys as SurveyOverview[], suspiciousMap);
    }
  }

  private buildPrompt(
    list: SurveyOverview[],
    suspiciousMap: Map<string, number>,
  ): string {
    const lines: string[] = ['你正在協助一位問券方分析他的問卷組合，建議下一步該做什麼：', ''];
    list.forEach((s, i) => {
      const completion = s.targetCount > 0
        ? Math.round((s.completedCount / s.targetCount) * 100)
        : 0;
      const susp = suspiciousMap.get(s.id) ?? 0;
      const expiresIn = s.expiresAt
        ? Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      lines.push(`#${i + 1} 「${s.title}」`);
      lines.push(`  ID: ${s.id}`);
      lines.push(`  狀態：${this.statusLabel(s.status)}`);
      lines.push(`  獎勵：NT$${s.rewardPoints}`);
      lines.push(`  回收：${s.completedCount}/${s.targetCount}（${completion}%）`);
      if (expiresIn !== null) {
        lines.push(`  距截止：${expiresIn > 0 ? `${expiresIn} 天` : '已逾期'}`);
      }
      if (susp > 0) lines.push(`  可疑填答：${susp} 筆`);
      lines.push('');
    });

    lines.push('---');
    lines.push('請回傳 JSON 格式：');
    lines.push('{');
    lines.push('  "primaryAction": { "label": "...", "surveyId": "...(可選)", "surveyTitle": "...(可選)", "reason": "..." },');
    lines.push('  "insights": ["洞察 1", "洞察 2"],');
    lines.push('  "alerts": [{ "severity": "info|warning", "message": "...", "surveyId": "...(可選)" }]');
    lines.push('}');
    lines.push('');
    lines.push('優先順序判斷：');
    lines.push('- 已上架但 0 填答 > 3 天：建議檢視可見度');
    lines.push('- 即將截止（< 3 天）且未達 50%：建議加碼或延展');
    lines.push('- 草稿超過 7 天未動：建議完成或刪除');
    lines.push('- 可疑填答多：建議檢視');
    lines.push('- 回收已達 90%：建議準備分析');

    return lines.join('\n');
  }

  private statusLabel(s: string): string {
    return ({
      draft: '草稿',
      pending_review: '審核中',
      published: '上架中',
      paused: '暫停',
      closed: '已關閉',
      rejected: '被退回',
    } as Record<string, string>)[s] ?? s;
  }

  private emptyState(): AssistantRecommendation {
    return {
      primaryAction: {
        label: '建立你的第一份問卷',
        reason: '尚未發布任何問卷，可從新增問卷開始或試用 AI 草稿生成',
      },
      insights: ['先用 AI 草稿快速產生 5-8 題的問卷雛形'],
      alerts: [],
      generatedAt: new Date().toISOString(),
    };
  }

  private fallback(
    list: SurveyOverview[],
    suspiciousMap: Map<string, number>,
  ): AssistantRecommendation {
    // 簡單規則：找最該處理的問卷
    const urgent = list.find((s) => {
      if (s.status === 'published' && s.expiresAt) {
        const days = Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const completion = s.targetCount > 0 ? s.completedCount / s.targetCount : 0;
        return days < 3 && completion < 0.5;
      }
      return false;
    }) ?? list.find((s) => s.status === 'rejected') ?? list[0];

    const insights: string[] = [];
    const published = list.filter((s) => s.status === 'published').length;
    if (published > 0) insights.push(`你有 ${published} 份問卷正在上架中`);
    const totalCollected = list.reduce((sum, s) => sum + s.completedCount, 0);
    insights.push(`所有問卷累計回收 ${totalCollected} 份`);

    const alerts: AssistantRecommendation['alerts'] = [];
    suspiciousMap.forEach((count, surveyId) => {
      if (count > 0) {
        const s = list.find((x) => x.id === surveyId);
        if (s) {
          alerts.push({
            severity: 'warning',
            message: `「${s.title}」有 ${count} 筆可疑填答`,
            surveyId,
          });
        }
      }
    });

    return {
      primaryAction: {
        label: urgent?.status === 'rejected' ? '修正被退回的問卷' : '檢視最重要的問卷',
        surveyId: urgent?.id,
        surveyTitle: urgent?.title,
        reason: 'AI 服務暫時不可用，以規則式建議優先處理需要關注的問卷',
      },
      insights,
      alerts,
      generatedAt: new Date().toISOString(),
    };
  }
}
