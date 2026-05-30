import { Injectable, Logger } from '@nestjs/common';
import { ZaiClient } from '../ai-audit/zai.client';
import {
  insightsCacheKey,
  getCachedInsight,
  setCachedInsight,
} from './analysis/insights-cache';

export type ReportType = 'simple' | 'detailed';

export interface SurveyInsights {
  reportType: ReportType;
  summary: string;
  keyFindings: string[];
  concerns: string[];
  recommendations: string[];
  // ─── detailed 報告才有的進階區塊（simple 為 undefined）─────────────────────
  /** 逐題深入洞察 */
  questionBreakdown?: Array<{ question: string; insight: string }>;
  /** 交叉/關聯發現（跨題、跨樣本的模式） */
  crossFindings?: string[];
  /** 方法與信賴度說明（樣本量、品質、偏差、解讀注意） */
  methodology?: string;
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

export interface ResponseSentiment {
  responseId: string;
  questionId: string;
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface ResponseSentimentsResult {
  surveyId: string;
  questionId: string;
  sentiments: ResponseSentiment[];
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
  // 由 getSurveyStats 一併帶入；detailed 報告用來補「樣本品質/信賴度」說明
  qualityDistribution?: {
    total: number;
    passed: number;
    suspicious: number;
    rejected: number;
    unaudited: number;
    avgScore: number | null;
  };
}

@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);
  constructor(private readonly zai: ZaiClient) {}

  /**
   * 把問卷統計丟給 LLM，得到結構化洞察。
   * @param reportType simple = 精簡摘要（預設）；detailed = 加逐題洞察 + 交叉發現 + 方法說明
   * 當樣本 < 3 或 LLM 失敗時，回退到 deterministic 規則生成的 fallback insights。
   */
  async analyze(
    stats: SurveyStatsInput,
    reportType: ReportType = 'simple',
  ): Promise<SurveyInsights> {
    const sampleSize = stats.totalResponses;

    // 樣本太少時跳過 LLM call，避免浪費 token
    if (sampleSize < 3) {
      return this.fallback(stats, '樣本數過少（< 3），尚不足以產生統計洞察', reportType);
    }

    // 兩層快取(L1 in-process 30 分鐘 + L2 Redis 跨進程共享,degradation-safe):
    // 相同 stats + reportType 直接回,免 LLM token。fallback 路徑不入 cache → 下次重試。設計文件 §5.4。
    const cacheKey = insightsCacheKey(stats, reportType);
    const hit = await getCachedInsight<SurveyInsights>(cacheKey);
    if (hit) {
      this.logger.log(`AI insights cache hit (${reportType})`);
      return hit;
    }

    const detailed = reportType === 'detailed';
    const prompt = this.buildPrompt(stats, reportType);
    const system = detailed
      ? '你是一名資深問卷研究分析師，正在撰寫一份「詳細分析報告」。你的回應**必須**是一個合法的 JSON 物件，' +
        '不可包含任何 markdown 標記、code fence、前後贅字或註解，直接以 { 開頭、以 } 結尾。' +
        '所有內容用繁體中文，絕對不可編造資料中沒有的內容。JSON 必須包含這些 key：' +
        'summary (string), keyFindings (string array), concerns (string array), recommendations (string array), ' +
        'questionBreakdown (array of {question:string, insight:string}，逐題各 1 句洞察), ' +
        'crossFindings (string array，跨題/關聯的觀察), methodology (string，樣本量/品質/偏差/解讀限制說明)。'
      : '你是一名專業的問卷分析師。你的回應**必須**是一個合法的 JSON 物件，' +
        '不可包含任何 markdown 標記、code fence、前後贅字或註解，直接以 { 開頭、以 } 結尾。' +
        '所有條目用繁體中文，每項精簡（≤ 40 字），絕對不可編造資料中沒有的內容。' +
        'JSON 必須包含這四個 key：summary (string), keyFindings (string array), ' +
        'concerns (string array), recommendations (string array)。';

    try {
      const raw = await this.zai.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        // max_tokens 含 reasoning tokens；GLM-5.1 reasoning 約耗 1000-2000 token。
        // detailed 輸出較長，給更大空間。
        { temperature: 0.3, maxTokens: detailed ? 14000 : 8000, jsonMode: true },
      );

      this.logger.debug(`Raw insights (${reportType}, first 300): ${raw.slice(0, 300)}`);
      const parsed = this.parseJson(raw);

      const base: SurveyInsights = {
        reportType,
        summary: String(parsed.summary ?? '').slice(0, detailed ? 600 : 300),
        keyFindings: this.withEvidenceQuotes(
          this.toArray(parsed.keyFindings),
          stats,
        ).slice(0, detailed ? 10 : 6),
        concerns: this.toArray(parsed.concerns).slice(0, detailed ? 6 : 4),
        recommendations: this.toArray(parsed.recommendations).slice(0, detailed ? 8 : 5),
        sampleSize,
        generatedAt: new Date().toISOString(),
      };

      if (detailed) {
        base.questionBreakdown = this.toBreakdown(parsed.questionBreakdown).slice(0, 30);
        base.crossFindings = this.toArray(parsed.crossFindings).slice(0, 8);
        const m = typeof parsed.methodology === 'string' ? parsed.methodology.trim() : '';
        base.methodology = m ? m.slice(0, 600) : undefined;
      }

      // 僅快取成功結果（fallback 不快取，方便下次 retry）
      await setCachedInsight(cacheKey, base);
      return base;
    } catch (err) {
      this.logger.error(`Z.ai AI insights (${reportType}) failed, returning fallback`, err);
      return this.fallback(stats, 'AI 服務暫時不可用，以下為基本統計摘要', reportType);
    }
  }

  /** 解析 LLM 回傳的 questionBreakdown array */
  private toBreakdown(v: unknown): Array<{ question: string; insight: string }> {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          question: String(o.question ?? '').slice(0, 120),
          insight: String(o.insight ?? '').slice(0, 200),
        };
      })
      .filter((b) => b.question && b.insight);
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

  // ─── 逐筆回應情緒分析（per-response sentiment badges）───────────────────────

  /**
   * 對指定題目的每一筆文字回答做逐筆情緒分析，回傳 ResponseSentimentsResult。
   * 會將回答分批送 LLM（每批最多 30 筆），每筆標注 positive / neutral / negative。
   * 若 LLM 失敗則 fallback 全標 neutral。
   */
  async analyzeResponseSentiments(
    surveyId: string,
    questionId: string,
    answers: Array<{ responseId: string; text: string }>,
  ): Promise<ResponseSentimentsResult> {
    const empty: ResponseSentimentsResult = {
      surveyId,
      questionId,
      sentiments: [],
      generatedAt: new Date().toISOString(),
    };
    if (answers.length === 0) return empty;

    // 過濾掉空白回答
    const valid = answers.filter((a) => a.text.trim().length > 0);
    if (valid.length === 0) return empty;

    const sentiments: ResponseSentiment[] = [];

    // 分批處理，每批最多 30 筆
    const BATCH = 30;
    for (let offset = 0; offset < valid.length; offset += BATCH) {
      const batch = valid.slice(offset, offset + BATCH);
      const enumerated = batch
        .map((a, i) => `${offset + i + 1}. [id:${a.responseId}] "${a.text.slice(0, 200)}"`)
        .join('\n');

      const prompt = [
        `以下共 ${batch.length} 筆文字回答，請為每一筆標注情緒：`,
        enumerated,
        '',
        '請回傳 JSON array，每個元素：',
        '{ "idx": <編號從1開始>, "responseId": "<id>", "sentiment": "positive|neutral|negative" }',
        '',
        '規則：',
        '- 每筆都要標，不可遺漏',
        '- positive: 正面/滿意/贊同/開心',
        '- neutral: 中性/描述性/無明顯傾向',
        '- negative: 負面/不滿/批評/抱怨',
        '- 不可編造，只根據文字內容判斷',
      ].join('\n');

      try {
        const r = await this.zai.jsonChat<
          Array<{ idx: number; responseId: string; sentiment: 'positive' | 'neutral' | 'negative' }>
        >(
          '你是文字情緒分類專家。請回傳 JSON array，為每筆回答標注情緒。繁體中文判斷。',
          prompt,
          { temperature: 0.1 },
        );

        if (Array.isArray(r)) {
          for (const item of r) {
            const s = item?.sentiment;
            const sentiment: 'positive' | 'neutral' | 'negative' =
              s === 'positive' || s === 'negative' ? s : 'neutral';
            const original = batch.find((a) => a.responseId === item?.responseId);
            if (original) {
              sentiments.push({
                responseId: original.responseId,
                questionId,
                text: original.text,
                sentiment,
              });
            }
          }
        }
      } catch (err) {
        this.logger.error('Per-response sentiment analysis batch failed, falling back to neutral', err);
        // fallback: 全標 neutral
        for (const a of batch) {
          sentiments.push({
            responseId: a.responseId,
            questionId,
            text: a.text,
            sentiment: 'neutral',
          });
        }
      }
    }

    return {
      surveyId,
      questionId,
      sentiments,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Prompt 組合 ──────────────────────────────────────────────────────────

  private buildPrompt(stats: SurveyStatsInput, reportType: ReportType = 'simple'): string {
    const detailed = reportType === 'detailed';
    const lines: string[] = [];
    lines.push(`問卷標題：${stats.title}`);
    lines.push(`有效樣本數：${stats.totalResponses}`);
    if (stats.qualityDistribution && stats.qualityDistribution.total > 0) {
      const q = stats.qualityDistribution;
      lines.push(
        `樣本品質：通過 ${q.passed} / 疑似 ${q.suspicious} / 退件 ${q.rejected} / 未審核 ${q.unaudited}` +
          (q.avgScore !== null ? `，平均品質分 ${q.avgScore}` : ''),
      );
    }
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
    if (detailed) {
      lines.push('請產生一份「詳細分析報告」，回傳 JSON，格式為：');
      lines.push('{');
      lines.push('  "summary": "3-5 句的整體洞察與脈絡",');
      lines.push('  "keyFindings": ["主要發現（可較多、含具體數字與短引述）", "..."],');
      lines.push('  "questionBreakdown": [{ "question": "題目（精簡）", "insight": "該題 1 句深入洞察" }],');
      lines.push('  "crossFindings": ["跨題/關聯觀察，例如 A 題高分者在 B 題傾向…"],');
      lines.push('  "concerns": ["資料品質/偏差/代表性注意事項"],');
      lines.push('  "recommendations": ["具體可執行的後續建議"],');
      lines.push('  "methodology": "說明樣本量、品質分布對結論信賴度的影響、解讀限制（2-4 句）"');
      lines.push('}');
      lines.push('');
      lines.push('注意：');
      lines.push('- questionBreakdown 要涵蓋每一題（有作答的題目）');
      lines.push('- crossFindings 只在資料真的呈現關聯時才寫，沒有就回空陣列，禁止臆測');
      lines.push('- methodology 必須誠實反映樣本量大小與品質對信賴度的影響');
      lines.push('- 全程不要編造數字或事實，所有結論須可由上方統計推得');
    } else {
      lines.push('請回傳 JSON，格式為：');
      lines.push('{');
      lines.push('  "summary": "1-2 句話的整體洞察",');
      lines.push('  "keyFindings": ["主要發現 1（含短引述）", "主要發現 2（含短引述）", "..."],');
      lines.push('  "concerns": ["資料品質/偏差注意事項"],');
      lines.push('  "recommendations": ["後續可行動的建議"]');
      lines.push('}');
      lines.push('');
      lines.push('注意：');
      lines.push('- 樣本數 < 30 時 concerns 必須提及樣本量小');
      lines.push('- recommendations 要具體可執行（例如「追加 X 題以驗證 Y」）');
      lines.push('- 不要編造數字或事實');
    }

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

  private withEvidenceQuotes(
    findings: string[],
    stats: SurveyStatsInput,
  ): string[] {
    if (findings.length === 0) return findings;
    const quotePool = stats.questionStats
      .flatMap((q) => q.sampleTexts ?? [])
      .map((text) => text?.trim())
      .filter((text): text is string => Boolean(text))
      .map((text) => this.normalizeQuote(text));
    if (quotePool.length === 0) return findings;

    let quoteIndex = 0;
    return findings.map((finding) => {
      if (this.hasQuotedSnippet(finding)) return finding;
      const quote = quotePool[quoteIndex % quotePool.length];
      quoteIndex += 1;
      return `${finding} (quote: "${quote.slice(0, 60)}")`;
    });
  }

  private hasQuotedSnippet(text: string): boolean {
    return text.includes('"');
  }

  private normalizeQuote(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/"/g, '').trim();
  }

  private fallback(
    stats: SurveyStatsInput,
    reasonNote: string,
    reportType: ReportType = 'simple',
  ): SurveyInsights {
    const findings: string[] = [];
    const breakdown: Array<{ question: string; insight: string }> = [];
    stats.questionStats.forEach((q) => {
      let qInsight = '';
      // 選擇題：找出最多人選的選項
      if (q.optionCounts && q.optionCounts.length > 0) {
        const totalVotes = q.optionCounts.reduce((s, o) => s + o.count, 0);
        if (totalVotes > 0) {
          const sorted = [...q.optionCounts].sort((a, b) => b.count - a.count);
          const top = sorted[0];
          const pct = Math.round((top.count / totalVotes) * 100);
          findings.push(`「${q.title}」最多人選「${top.label}」（${pct}%）`);
          qInsight = `最多人選「${top.label}」（${pct}%），共 ${totalVotes} 票`;
        }
      }
      // 評分題：平均分
      if (typeof q.averageRating === 'number') {
        findings.push(`「${q.title}」平均分 ${q.averageRating.toFixed(1)} / 5`);
        qInsight = `平均分 ${q.averageRating.toFixed(1)} / 5（${q.totalAnswers} 人評分）`;
      }
      // 文字題：列出第一個有效回答
      if (q.sampleTexts && q.sampleTexts.length > 0) {
        const first = q.sampleTexts.find((t) => t && t.trim());
        if (first) {
          findings.push(`「${q.title}」收到開放回答（樣本："${String(first).slice(0, 30)}..."）`);
          qInsight = `收到 ${q.totalAnswers} 則開放回答，需人工或 AI 進一步歸納主題`;
        }
      }
      if (qInsight) breakdown.push({ question: q.title, insight: qInsight });
    });

    const concerns: string[] = [];
    if (stats.totalResponses < 30) {
      concerns.push('樣本數偏少（< 30），洞察僅供參考，建議擴大樣本後重新分析');
    }
    if (findings.length === 0) {
      concerns.push('尚無有效作答可分析，請等待更多受試者填答');
    }

    const base: SurveyInsights = {
      reportType,
      summary: reasonNote,
      keyFindings: findings.slice(0, reportType === 'detailed' ? 10 : 6),
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

    if (reportType === 'detailed') {
      base.questionBreakdown = breakdown.slice(0, 30);
      base.crossFindings = [];
      const q = stats.qualityDistribution;
      base.methodology =
        `本報告為規則式 fallback（AI 服務不可用時生成）。樣本數 ${stats.totalResponses} 份` +
        (q && q.total > 0 && q.avgScore !== null ? `，平均品質分 ${q.avgScore}` : '') +
        (stats.totalResponses < 30 ? '，樣本量偏小、結論代表性有限。' : '。') +
        ' AI 恢復後重新生成可取得完整詳細分析。';
    }

    return base;
  }
}
