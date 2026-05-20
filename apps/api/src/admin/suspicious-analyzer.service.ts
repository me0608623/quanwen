import { Injectable, Logger } from '@nestjs/common';
import { ZaiClient } from '../ai-audit/zai.client';

export interface SuspiciousAnalysis {
  severity: 'low' | 'medium' | 'high';
  reasoning: string;       // 1-2 句白話解釋為何可疑
  signals: string[];       // 具體訊號條列
  recommendation: 'reject' | 'review_more' | 'accept';
  recommendationReason: string;
}

interface AnalyzeInput {
  surveyTitle: string;
  rewardPoints: number;
  antiCheatScore: number;
  suspiciousFlags: string[];
  fillDurationSeconds: number | null;
}

@Injectable()
export class SuspiciousAnalyzerService {
  private readonly logger = new Logger(SuspiciousAnalyzerService.name);
  constructor(private readonly zai: ZaiClient) {}

  async analyze(input: AnalyzeInput): Promise<SuspiciousAnalysis> {
    const prompt = this.buildPrompt(input);
    try {
      return await this.zai.jsonChat<SuspiciousAnalysis>(
        '你是反作弊分析師。基於可疑填答的訊號，用繁體中文給出白話分析。' +
          '回傳 JSON 包含 severity (low/medium/high)、reasoning (1-2 句解釋)、' +
          'signals (string array, 具體訊號)、recommendation (reject/review_more/accept)、' +
          'recommendationReason (理由)。',
        prompt,
        { temperature: 0.3 },
      );
    } catch (err) {
      this.logger.error('AI 可疑分析失敗', err);
      return this.fallback(input);
    }
  }

  private buildPrompt(input: AnalyzeInput): string {
    return [
      '請分析這筆填答為何被反作弊系統標記為可疑：',
      '',
      `問卷標題：${input.surveyTitle}`,
      `獎勵金額：NT$${input.rewardPoints}`,
      `反作弊分數：${input.antiCheatScore} / 100（越高越可疑）`,
      `填答時長：${input.fillDurationSeconds ?? '未知'} 秒`,
      `系統標記的可疑訊號：`,
      ...(input.suspiciousFlags.length > 0
        ? input.suspiciousFlags.map((f) => `  - ${f}`)
        : ['  (無)']),
      '',
      '參考標準：',
      '- 一般問卷填答時長：60-300 秒',
      '- < 30 秒幾乎不可能認真作答',
      '- 反作弊分數 ≥ 80：嚴重可疑',
      '- 反作弊分數 60-79：中度可疑',
      '- 反作弊分數 < 60：輕度可疑',
      '',
      '請給出具體、可行動的分析。recommendation 必須是 reject (建議拒絕)、' +
        'review_more (需查看更多細節)、accept (其實可以接受) 三選一。',
    ].join('\n');
  }

  private fallback(input: AnalyzeInput): SuspiciousAnalysis {
    const severity: 'low' | 'medium' | 'high' =
      input.antiCheatScore >= 80 ? 'high' :
      input.antiCheatScore >= 60 ? 'medium' : 'low';

    const signals: string[] = [];
    if (input.fillDurationSeconds !== null && input.fillDurationSeconds < 30) {
      signals.push(`填答時長僅 ${input.fillDurationSeconds} 秒，遠低於合理範圍（60+ 秒）`);
    }
    if (input.antiCheatScore >= 80) {
      signals.push('反作弊分數高達 ' + input.antiCheatScore + '，屬於嚴重可疑');
    }
    signals.push(...input.suspiciousFlags);

    return {
      severity,
      reasoning: 'AI 服務暫時不可用。以下為基於規則的初步分析。',
      signals,
      recommendation: severity === 'high' ? 'reject' : 'review_more',
      recommendationReason:
        severity === 'high'
          ? '反作弊分數過高，建議拒絕並阻擋該受試者再次填答'
          : '需要查看實際答案內容後再決定',
    };
  }
}
