import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'crypto';
import { zaiTelemetry } from './telemetry';
import { RedisCache } from './redis-cache';

interface ZaiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZaiChatRequest {
  model: string;
  messages: ZaiMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
  // glm-5.1 等推理模型預設會生成大量 reasoning_content（一次呼叫可達 25s+），
  // 關閉後同樣品質但快 4~5 倍。type:'disabled' 跳過思考鏈。
  thinking?: { type: 'enabled' | 'disabled' };
}

interface ZaiChatResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type ZaiErrorKind =
  | 'timeout'
  | 'http_5xx'
  | 'http_4xx'
  | 'http_401'
  | 'network'
  | 'parse';

export class ZaiError extends Error {
  readonly kind: ZaiErrorKind;
  readonly status?: number;
  readonly attempts: number;

  constructor(
    kind: ZaiErrorKind,
    message: string,
    attempts: number,
    status?: number,
  ) {
    super(message);
    this.name = 'ZaiError';
    this.kind = kind;
    this.status = status;
    this.attempts = attempts;
  }

  /** kind 是否該被 retry */
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'http_5xx' || this.kind === 'network';
  }
}

interface ZaiTelemetry {
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
  attempts: number;
  promptKey?: string;     // Phase II.5: 哪支 prompt 用的
  promptVersion?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000; // 推理模型較慢，給足單次完成的時間(避免被 abort 後狂重試)
const DEFAULT_MAX_RETRIES = 2; // 共嘗試 1 + 2 = 3 次
const RETRY_BASE_MS = 500;

const DEFAULT_CACHE_TTL_MS = 5 * 60_000; // 5 分鐘
const DEFAULT_CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  content: string;
  expiresAt: number;
}

/**
 * 簡易 LRU：用 Map 的 insertion-order 特性實作。
 * - get 命中 → 把 key 移到 Map 尾端（最新）
 * - set 超過 max → 刪掉 Map 第一個 key（最舊）
 *
 * 注意：這是 in-memory，每個 Node 進程獨立；多實例部署時不共享。
 * 對 SaaS 平台 stats 摘要這類「同輸入短時間內可能被多次查詢」的場景仍有效。
 */
class ZaiCache {
  private map = new Map<string, CacheEntry>();
  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): string | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // LRU：移到 Map 尾端
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.content;
  }

  set(key: string, content: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { content, expiresAt: Date.now() + this.ttlMs });
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

@Injectable()
export class ZaiClient {
  private readonly logger = new Logger(ZaiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly thinkingDisabled: boolean;
  private readonly cacheEnabled: boolean;
  private readonly cache: ZaiCache;
  private readonly l2: RedisCache | null;

  constructor() {
    this.baseUrl = process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4';
    this.apiKey = process.env.ZAI_API_KEY ?? '';
    this.model = process.env.ZAI_MODEL ?? 'glm-5.1';
    this.timeoutMs = parseInt(process.env.ZAI_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10);
    this.maxRetries = parseInt(process.env.ZAI_MAX_RETRIES ?? String(DEFAULT_MAX_RETRIES), 10);
    // 預設關閉推理鏈(快 4~5 倍);要恢復深度推理設 ZAI_ENABLE_THINKING=true
    this.thinkingDisabled = process.env.ZAI_ENABLE_THINKING !== 'true';

    const ttlMs = parseInt(process.env.ZAI_CACHE_TTL_MS ?? String(DEFAULT_CACHE_TTL_MS), 10);
    const cacheMax = parseInt(
      process.env.ZAI_CACHE_MAX ?? String(DEFAULT_CACHE_MAX_ENTRIES),
      10,
    );
    this.cacheEnabled = process.env.ZAI_CACHE_DISABLED !== 'true' && ttlMs > 0;
    this.cache = new ZaiCache(cacheMax, ttlMs);

    // Phase II.10: Redis L2（跨進程共享）。沒設 URL / 沒裝 ioredis → 自動降級為 in-memory only
    const redisUrl = process.env.ZAI_REDIS_URL ?? process.env.REDIS_URL;
    this.l2 = this.cacheEnabled && redisUrl ? new RedisCache(redisUrl, ttlMs) : null;

    if (!this.apiKey) {
      // 不在 constructor throw — service 在 prod 環境若沒設仍可走 fallback path
      // 真正 chat 時才檢查
      this.logger.warn('ZAI_API_KEY 未設定；LLM 呼叫會直接 throw ZaiError(http_401)');
    }
  }

  /** Cache key = sha256(model + temperature + messages + jsonMode)。temperature 影響輸出，必須納入 key */
  private cacheKey(messages: ZaiMessage[], options: { temperature?: number; jsonMode?: boolean }): string {
    const payload = JSON.stringify({
      model: this.model,
      temperature: options.temperature ?? 0.3,
      jsonMode: options.jsonMode ?? false,
      messages,
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  /** 強制清空 cache（測試用 / 手動 cache invalidation） */
  clearCache(): void {
    this.cache.clear();
  }

  async chat(
    messages: ZaiMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
      cache?: boolean;
      thinking?: 'enabled' | 'disabled';  // 覆寫全域 ZAI_ENABLE_THINKING 設定
      promptKey?: string;     // Phase II.5: telemetry 用
      promptVersion?: string;
    } = {},
  ): Promise<string> {
    if (!this.apiKey) {
      const e = new ZaiError('http_401', 'ZAI_API_KEY 未設定', 0);
      this.recordErrorTelemetry(e, options);
      throw e;
    }

    // Cache lookup（caller 可用 cache:false 旁路）
    const useCache = this.cacheEnabled && options.cache !== false;
    const cacheK = useCache ? this.cacheKey(messages, options) : null;
    if (cacheK) {
      // L1：in-memory（最快）
      const l1Hit = this.cache.get(cacheK);
      if (l1Hit !== undefined) {
        this.logger.log(
          `zai.chat CACHE_HIT(L1) model=${this.model} key=${cacheK.slice(0, 16)} size=${this.cache.size}`,
        );
        this.recordCacheHit({ ...options, model: this.model });
        return l1Hit;
      }
      // L2：Redis（跨進程）。命中後回填 L1
      if (this.l2) {
        const l2Hit = await this.l2.get(cacheK);
        if (l2Hit !== undefined) {
          this.logger.log(`zai.chat CACHE_HIT(L2) model=${this.model} key=${cacheK.slice(0, 16)}`);
          this.cache.set(cacheK, l2Hit); // 回填 L1
          this.recordCacheHit({ ...options, model: this.model });
          return l2Hit;
        }
      }
    }

    const body: ZaiChatRequest = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    // 關閉推理鏈以大幅降低延遲(per-call 可用 options.thinking 覆寫)
    const disableThinking = options.thinking
      ? options.thinking === 'disabled'
      : this.thinkingDisabled;
    if (disableThinking) {
      body.thinking = { type: 'disabled' };
    }

    const startedAt = Date.now();
    let lastError: ZaiError | null = null;

    try {
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Language': 'en-US,en',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '<unreadable>');
          const status = response.status;
          const kind: ZaiErrorKind =
            status === 401 || status === 403
              ? 'http_401'
              : status >= 500
                ? 'http_5xx'
                : 'http_4xx';
          const err = new ZaiError(kind, `HTTP ${status}: ${errorText.slice(0, 200)}`, attempt, status);

          // 4xx 不 retry，馬上失敗
          if (!err.retryable || attempt > this.maxRetries) {
            this.logger.error(
              `Z.ai HTTP ${status} (attempt ${attempt}/${this.maxRetries + 1}, kind=${kind}): ${errorText.slice(0, 200)}`,
            );
            throw err;
          }

          lastError = err;
        } else {
          const data = (await response.json()) as ZaiChatResponse;
          const choice = data.choices[0];
          const content = choice?.message?.content ?? '';
          const finishReason = choice?.finish_reason ?? 'unknown';
          const telemetry: ZaiTelemetry = {
            model: this.model,
            latencyMs: Date.now() - startedAt,
            promptTokens: data.usage?.prompt_tokens ?? 0,
            completionTokens: data.usage?.completion_tokens ?? 0,
            totalTokens: data.usage?.total_tokens ?? 0,
            finishReason,
            attempts: attempt,
            promptKey: options.promptKey,
            promptVersion: options.promptVersion,
          };
          this.logger.log(`zai.chat OK ${JSON.stringify(telemetry)}`);
          zaiTelemetry.record({
            ts: Date.now(),
            promptKey: options.promptKey,
            promptVersion: options.promptVersion,
            model: this.model,
            totalTokens: telemetry.totalTokens,
            promptTokens: telemetry.promptTokens,
            completionTokens: telemetry.completionTokens,
            latencyMs: telemetry.latencyMs,
            attempts: telemetry.attempts,
            finishReason,
            cacheHit: false,
          });

          if (finishReason === 'length') {
            this.logger.warn(
              `Z.ai output truncated (finish_reason=length). Consider raising maxTokens. usage=${JSON.stringify(data.usage)}`,
            );
          }

          // Cache write — 不快取 truncated output（不完整資料快取會 mislead 後續查詢）
          if (cacheK && finishReason !== 'length') {
            this.cache.set(cacheK, content);
            // L2 寫入 fire-and-forget — Redis 慢/掛不能拖累主流程
            if (this.l2) {
              void this.l2.set(cacheK, content);
            }
          }

          return content;
        }
      } catch (err) {
        clearTimeout(timer);

        // 已是 ZaiError（內層 throw），按其 retryable 邏輯處理
        if (err instanceof ZaiError) {
          if (!err.retryable || attempt > this.maxRetries) throw err;
          lastError = err;
        } else {
          // AbortError / network error
          const isAbort = (err as Error)?.name === 'AbortError';
          const kind: ZaiErrorKind = isAbort ? 'timeout' : 'network';
          const message = isAbort
            ? `request exceeded ${this.timeoutMs}ms`
            : `network error: ${(err as Error)?.message ?? 'unknown'}`;
          const wrapped = new ZaiError(kind, message, attempt);
          if (attempt > this.maxRetries) {
            this.logger.error(`Z.ai ${kind} after ${attempt} attempts: ${message}`);
            throw wrapped;
          }
          lastError = wrapped;
        }
      }

      // 指數退避：500ms / 1000ms / 2000ms...
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      this.logger.warn(
        `Z.ai retry in ${delay}ms (attempt ${attempt}/${this.maxRetries + 1}, last=${lastError?.kind})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    // 不會到這（loop 內每條路徑都 throw 或 return），但 TS narrow 用
    throw lastError ?? new ZaiError('network', 'unreachable', 0);
    } catch (err) {
      // 任何 terminal ZaiError 在這集中記錄一次 telemetry 後 rethrow
      if (err instanceof ZaiError) {
        this.recordErrorTelemetry(err, options, Date.now() - startedAt);
      }
      throw err;
    }
  }

  private recordCacheHit(options: { promptKey?: string; promptVersion?: string; model?: string }): void {
    zaiTelemetry.record({
      ts: Date.now(),
      promptKey: options.promptKey,
      promptVersion: options.promptVersion,
      model: options.model,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      attempts: 0,
      finishReason: 'cache_hit',
      cacheHit: true,
    });
  }

  /** shutdown / 測試用：關閉 L2 連線 */
  async closeL2(): Promise<void> {
    await this.l2?.close();
  }

  private recordErrorTelemetry(
    err: ZaiError,
    options: { promptKey?: string; promptVersion?: string },
    latencyMs = 0,
  ): void {
    zaiTelemetry.record({
      ts: Date.now(),
      promptKey: options.promptKey,
      promptVersion: options.promptVersion,
      model: this.model,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs,
      attempts: err.attempts,
      finishReason: 'error',
      errorKind: err.kind,
      cacheHit: false,
    });
  }

  async jsonChat<T>(
    systemPrompt: string,
    userPrompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      promptKey?: string;
      promptVersion?: string;
    } = {},
  ): Promise<T> {
    // 強化 system prompt 確保 LLM 回 JSON 而不是 markdown
    const enforcedSystem =
      `${systemPrompt}\n\n` +
      '⚠️ 重要：你的回應**必須**是合法 JSON，直接以 { 開頭、以 } 結尾，' +
      '不可包含 markdown code fence、解釋文字或其他內容。';

    const content = await this.chat(
      [
        { role: 'system', content: enforcedSystem },
        { role: 'user', content: userPrompt },
      ],
      // GLM-5.1 reasoning 會吃 token，需要 8000+
      { ...options, maxTokens: options.maxTokens ?? 8000, jsonMode: true },
    );

    const jsonMatch =
      content.match(/```json\n?([\s\S]*?)\n?```/) ?? content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      // 完整 log 內容（PII redact 在 caller 端做；這層只看 LLM raw output）
      this.logger.error(`Z.ai JSON parse failed. Full content (${content.length} chars): ${content}`);
      throw new ZaiError('parse', 'AI 回應無法解析為 JSON', 1);
    }

    try {
      return JSON.parse(jsonMatch[1]!) as T;
    } catch (err) {
      this.logger.error(
        `Z.ai JSON.parse threw on matched content: ${jsonMatch[1]?.slice(0, 500)}; err: ${(err as Error).message}`,
      );
      throw new ZaiError('parse', `JSON.parse 失敗：${(err as Error).message}`, 1);
    }
  }
}

/**
 * 給呼叫端用的 helper：把 ZaiError 轉成 Nest HTTP exception。
 * service 通常不需用這個（會走自己的 fallback），但 controller 直接 expose AI 時可用。
 */
export function zaiErrorToHttp(err: unknown): never {
  if (err instanceof ZaiError) {
    throw new InternalServerErrorException(
      `AI 服務暫時無法使用（${err.kind}，attempts=${err.attempts}）`,
    );
  }
  throw err;
}
