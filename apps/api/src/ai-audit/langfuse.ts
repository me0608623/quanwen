/**
 * Phase II.LF (QUA-175): Langfuse LLM observability sink.
 *
 * 註冊為 zaiTelemetry 的 sink，每次 LLM call 自動產生 Langfuse generation trace。
 *
 * 架構：
 * - LangfuseSink class 負責把 TelemetryRecord 轉成 Langfuse trace + generation
 * - 不需要修改 ZaiClient 或任何 caller — sink 模式與現有 ZaiCallLogService 平行
 * - LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY 未設定 → 自動 no-op（不影響主流程）
 *
 * Langfuse 雲端（免費方案）啟動門檻最低：
 * - 註冊 https://cloud.langfuse.com 取得 keys
 * - 設定 LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST（選填）
 * - 重啟 API server 即可
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { zaiTelemetry, type TelemetryRecord } from './telemetry';

/**
 * Langfuse SDK type — 動態 import 避免未安裝時 build 失敗。
 * langfuse 已在 package.json 但只在 LANGFUSE_PUBLIC_KEY 設定時初始化。
 */
interface LangfuseClient {
  trace(params: {
    id?: string;
    name: string;
    metadata?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }): {
    generation(params: {
      name: string;
      model: string;
      input?: unknown;
      output?: unknown;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
      metadata?: Record<string, unknown>;
      startTime?: Date;
      endTime?: Date;
      statusMessage?: string;
    }): void;
  };
  shutdownAsync(): Promise<void>;
}

@Injectable()
export class LangfuseSink implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangfuseSink.name);
  private client: LangfuseClient | null = null;
  private unregister: (() => void) | null = null;

  async onModuleInit(): Promise<void> {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;

    if (!publicKey || !secretKey) {
      this.logger.log('Langfuse keys 未設定，sink 停用（設定 LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY 啟用）');
      return;
    }

    try {
      // 動態 import langfuse
      const { Langfuse } = await import('langfuse') as { Langfuse: new (opts: {
        publicKey: string;
        secretKey: string;
        baseUrl?: string;
        flushInterval?: number;
      }) => LangfuseClient };

      const baseUrl = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

      this.client = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        flushInterval: 10_000, // 10 秒 flush 一次（降低網路開銷）
      });

      // 註冊 telemetry sink
      this.unregister = zaiTelemetry.registerSink((r) => this.onRecord(r));
      this.logger.log(`Langfuse sink 已啟用 (host=${baseUrl})`);
    } catch (err) {
      this.logger.warn(`Langfuse 初始化失敗，sink 停用: ${(err as Error)?.message}`);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    if (this.client) {
      await this.client.shutdownAsync().catch(() => {});
    }
  }

  private onRecord(r: TelemetryRecord): void {
    if (!this.client) return;

    try {
      const modelName = r.model || 'glm-5.1';
      const isError = !!r.errorKind;
      const isCacheHit = r.cacheHit;

      // 用 promptKey 當 trace name（方便在 Langfuse UI 看哪個 prompt family）
      const traceName = r.promptKey || 'zai-unknown';
      const generationName = `${traceName}@${r.promptVersion || 'v0'}`;

      // trace ID 用 timestamp + promptKey 確保同一批 grouping
      const traceId = `${r.ts}-${traceName}`;

      const startTime = new Date(r.ts);
      const endTime = new Date(r.ts + r.latencyMs);

      const trace = this.client.trace({
        id: traceId,
        name: traceName,
        metadata: {
          environment: process.env.NODE_ENV || 'development',
          cacheHit: isCacheHit,
          attempts: r.attempts,
        },
        output: isError
          ? { error: r.errorKind }
          : { finishReason: r.finishReason },
      });

      trace.generation({
        name: generationName,
        model: modelName,
        usage: {
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          totalTokens: r.totalTokens,
        },
        metadata: {
          promptVersion: r.promptVersion,
          errorKind: r.errorKind,
          cacheHit: isCacheHit,
          latencyMs: r.latencyMs,
          attempts: r.attempts,
        },
        startTime,
        endTime,
        statusMessage: isError
          ? `error: ${r.errorKind}`
          : isCacheHit
            ? 'cache_hit'
            : r.finishReason,
      });
    } catch (err) {
      // sink 出錯絕對不能影響主流程 — 只 log 一次
      this.logger.warn(`Langfuse sink 寫入失敗: ${(err as Error)?.message}`);
    }
  }
}
