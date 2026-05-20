import { Injectable, Logger } from '@nestjs/common';
import { ZaiClient } from '../ai-audit/zai.client';

export interface SurveyInsights {
  summary: string;
  keyFindings: string[];
  concerns: string[];
  recommendations: string[];
  sampleSize: number;
  generatedAt: string;
}

export interface TextSentimentResult {
  question: string;
  sampleSize: number;
  positive: number;
  neutral: number;
  negative: number;
  themes: Array<{
    label: string;
    frequency: 'high' | 'medium' | 'low';
    examples: string[];
  }>;
  generatedAt: string;
}

interface QuestionStatInput {
  questionId: string;
  title: string;
  type: string;
  totalAnswers: number;
  optionCounts?: Array<{ label: string; count: number }>;
  averageRating?: number | null;
  sampleTexts?: Array<string | null>;
}

interface SurveyStatsInput {
  title: string;
  totalResponses: number;
  questionStats: QuestionStatInput[];
}

@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);
  constructor(private readonly zai: ZaiClient) {}

  /**
   * 把問卷統計丟給 LLM，得到結構化洞察。
   * 當樣本 < 3 或 LLM 失敗時，回退到 deterministic 規則生成的 fallback insights。
   */
  async analyze(stats: SurveyStatsInput): Promise<SurveyInsights> {
    const sampleSize = stats.totalResponses;

    // 樣本太少時跳過 LLM call，避免浪費 token
    if (sampleSize < 3) {
      return this.fallback(stats, '樣本數過少（< 3），尚不足以產生統計洞察');
    }

    const prompt = this.buildPrompt(stats);
    try {
      const raw = await this.zai.chat(
        [
          {
            role: 'system',
            content:
              '你是一名專業的問卷分析師。你的回應**必須**是一個合法的 JSON 物件，' +
              '不可包含任何 markdown 標記、code fence、前後贅字或註解，' +
              '直接以 { 開頭、以 } 結尾。' +
              '所有條目用繁體中文，每項精簡（≤ 40 字），絕對不可編造資料中沒有的內容。' +
              'JSON 必須包含這四個 key：summary (string), keyFindings (string array), ' +
              'concerns (string array), recommendations (string array)。',
          },
          { role: 'user', content: prompt },
        ],
        // max_tokens 含 reasoning tokens；GLM-5.1 reasoning 約耗 1000-2000 token，
        // 要留 1500+ 給實際 JSON 輸出，所以給 8000 才夠。
        { temperature: 0.3, maxTokens: 8000, jsonMode: true },
      );

      this.logger.debug(`Raw insights response (first 300): ${raw.slice(0, 300)}`);
      const parsed = this.parseJson(raw);
      return {
        summary: String(parsed.summary ?? '').slice(0, 300),
        keyFindings: this.toArray(parsed.keyFindings).slice(0, 6),
        concerns: this.toArray(parsed.concerns).slice(0, 4),
        recommendations: this.toArray(parsed.recommendations).slice(0, 5),
        sampleSize,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('Z.ai AI insights failed, returning fallback', err);
      return this.fallback(stats, 'AI 服務暫時不可用，以下為基本統計摘要');
    }
  }

  // ─── 開放題情緒分析 ──────────────────────────────────────────────────────

  async analyzeTextSentiment(
    question: string,
    texts: string[],
  ): Promise<TextSentimentResult> {
    if (texts.length === 0) {
      return {
        question,
        sampleSize: 0,
        positive: 0, neutral: 0, negative: 0,
        themes: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const enumerated = texts.slice(0, 30).map((t, i) => `${i + 1}. "${t.slice(0, 200)}"`).join('\n');
    const prompt = [
      `題目：「${question}」`,
      `共 ${texts.length} 筆回答（最多顯示 30 筆）：`,
      enumerated,
      '',
      '請回傳 JSON：',
      '{',
      '  "positive": <正向回答數>,',
      '  "neutral": <中性回答數>,',
      '  "negative": <負向回答數>,',
      '  "themes": [',
      '    { "label": "主題", "frequency": "high|medium|low", "examples": ["代表性回答片段"] }',
      '  ]',
      '}',
      '',
      '請：',
      '- positive + neutral + negative 加總 = 顯示數量',
      '- themes 列 3-5 個關鍵主題',
      '- examples 每個 themes 1-2 個（用引用片段，≤ 30 字）',
      '- 禁編造，所有 examples 必須來自上方回答',
    ].join('\n');

    try {
      const r = await this.zai.jsonChat<{
        positive: number; neutral: number; negative: number;
        themes: Array<{ label: string; frequency: 'high' | 'medium' | 'low'; examples: string[] }>;
      }>(
        '你是文字情緒分類專家。給出 JSON 統計，繁體中文。' +
          'positive/neutral/negative 是整數計數，3 者加總 ≤ 樣本數。' +
          'themes 抓出反覆出現的關鍵主題。禁編造。',
        prompt,
        { temperature: 0.2 },
      );
      return {
        question,
        sampleSize: texts.length,
        positive: r.positive ?? 0,
        neutral: r.neutral ?? 0,
        negative: r.negative ?? 0,
        themes: (r.themes ?? []).slice(0, 5),
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('Sentiment analysis failed', err);
      return {
        question,
        sampleSize: texts.length,
        // 中性 fallback
        positive: 0, neutral: texts.length, negative: 0,
        themes: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // ─── Prompt 組合 ──────────────────────────────────────────────────────────

  private buildPrompt(stats: SurveyStatsInput): string {
    const lines: string[] = [];
    lines.push(`問卷標題：${stats.title}`);
    lines.push(`有效樣本數：${stats.totalResponses}`);
    lines.push('');
    lines.push('題目統計：');

    stats.questionStats.forEach((q, i) => {
      lines.push(`Q${i + 1}（${this.translateType(q.type)}）：${q.title}`);
      lines.push(`  作答人數：${q.totalAnswers}`);
      if (q.optionCounts && q.optionCounts.length > 0) {
        const total = q.totalAnswers || 1;
        q.optionCounts.forEach((o) => {
          const pct = Math.round((o.count / total) * 100);
          lines.push(`  - ${o.label}：${o.count} 票 (${pct}%)`);
        });
      }
      if (typeof q.averageRating === 'number') {
        lines.push(`  平均分數：${q.averageRating.toFixed(2)} / 5`);
      }
      if (q.sampleTexts && q.sampleTexts.length > 0) {
        lines.push('  文字回答樣本：');
        q.sampleTexts.filter(Boolean).slice(0, 8).forEach((t) => {
          lines.push(`    "${String(t).slice(0, 120)}"`);
        });
      }
      lines.push('');
    });

    lines.push('---');
    lines.push('請回傳 JSON，格式為：');
    lines.push('{');
    lines.push('  "summary": "1-2 句話的整體洞察",');
    lines.push('  "keyFindings": ["主要發現 1", "主要發現 2", "..."],');
    lines.push('  "concerns": ["資料品質/偏差注意事項"],');
    lines.push('  "recommendations": ["後續可行動的建議"]');
    lines.push('}');
    lines.push('');
    lines.push('注意：');
    lines.push('- 樣本數 < 30 時 concerns 必須提及樣本量小');
    lines.push('- recommendations 要具體可執行（例如「追加 X 題以驗證 Y」）');
    lines.push('- 不要編造數字或事實');

    return lines.join('\n');
  }

  // ─── 輔助方法 ────────────────────────────────────────────────────────────

  private translateType(t: string): string {
    return ({
      single_choice: '單選題',
      multiple_choice: '多選題',
      text: '開放題',
      rating: '評分題',
      matrix: '矩陣題',
    } as Record<string, string>)[t] ?? t;
  }

  private parseJson(raw: string): Record<string, unknown> {
    // LLM 偶爾會包 ``` 或前綴雜訊，盡力撈出 { … }
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('LLM 回應沒有 JSON');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  private toArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return [];
  }

  private fallback(stats: SurveyStatsInput, reasonNote: string): SurveyInsights {
    const findings: string[] = [];
    stats.questionStats.forEach((q) => {
      // 選擇題：找出最多人選的選項
      if (q.optionCounts && q.optionCounts.length > 0) {
        const totalVotes = q.optionCounts.reduce((s, o) => s + o.count, 0);
        if (totalVotes > 0) {
          const sorted = [...q.optionCounts].sort((a, b) => b.count - a.count);
          const top = sorted[0];
          const pct = Math.round((top.count / totalVotes) * 100);
          findings.push(`「${q.title}」最多人選「${top.label}」（${pct}%）`);
        }
      }
      // 評分題：平均分
      if (typeof q.averageRating === 'number') {
        findings.push(`「${q.title}」平均分 ${q.averageRating.toFixed(1)} / 5`);
      }
      // 文字題：列出第一個有效回答
      if (q.sampleTexts && q.sampleTexts.length > 0) {
        const first = q.sampleTexts.find((t) => t && t.trim());
        if (first) {
          findings.push(`「${q.title}」收到開放回答（樣本："${String(first).slice(0, 30)}..."）`);
        }
      }
    });

    const concerns: string[] = [];
    if (stats.totalResponses < 30) {
      concerns.push('樣本數偏少（< 30），洞察僅供參考，建議擴大樣本後重新分析');
    }
    if (findings.length === 0) {
      concerns.push('尚無有效作答可分析，請等待更多受試者填答');
    }

    return {
      summary: reasonNote,
      keyFindings: findings.slice(0, 6),
      concerns,
      recommendations: [
        stats.totalResponses < 30
          ? '推廣問卷或調整目標受眾以累積更多樣本'
          : '可考慮做交叉分析（例如年齡 × 滿意度）發掘細部模式',
        'AI 服務恢復後重新點擊「重新生成」可取得完整 LLM 洞察',
      ],
      sampleSize: stats.totalResponses,
      generatedAt: new Date().toISOString(),
    };
  }
}
