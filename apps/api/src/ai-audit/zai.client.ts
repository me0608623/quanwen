import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

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
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2; // 共嘗試 1 + 2 = 3 次
const RETRY_BASE_MS = 500;

@Injectable()
export class ZaiClient {
  private readonly logger = new Logger(ZaiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor() {
    this.baseUrl = process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4';
    this.apiKey = process.env.ZAI_API_KEY ?? '';
    this.model = process.env.ZAI_MODEL ?? 'glm-5.1';
    this.timeoutMs = parseInt(process.env.ZAI_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10);
    this.maxRetries = parseInt(process.env.ZAI_MAX_RETRIES ?? String(DEFAULT_MAX_RETRIES), 10);

    if (!this.apiKey) {
      // 不在 constructor throw — service 在 prod 環境若沒設仍可走 fallback path
      // 真正 chat 時才檢查
      this.logger.warn('ZAI_API_KEY 未設定；LLM 呼叫會直接 throw ZaiError(http_401)');
    }
  }

  async chat(
    messages: ZaiMessage[],
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
  ): Promise<string> {
    if (!this.apiKey) {
      throw new ZaiError('http_401', 'ZAI_API_KEY 未設定', 0);
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

    const startedAt = Date.now();
    let lastError: ZaiError | null = null;

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
          };
          this.logger.log(`zai.chat OK ${JSON.stringify(telemetry)}`);

          if (finishReason === 'length') {
            this.logger.warn(
              `Z.ai output truncated (finish_reason=length). Consider raising maxTokens. usage=${JSON.stringify(data.usage)}`,
            );
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
  }

  async jsonChat<T>(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; maxTokens?: number } = {},
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
