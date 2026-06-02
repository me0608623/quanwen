/// <reference types="node" />

/**
 * Phase O.3: Next.js instrumentation hook
 *
 * 在 Next.js 14+，建立 src/instrumentation.ts 並 export `register()` 會在每個 runtime
 * 啟動時自動執行。
 *
 * Sentry 是 env-gated：只在 NEXT_PUBLIC_SENTRY_DSN 有設定時 init。
 * Skeleton — 需要 `pnpm i @sentry/nextjs` 才會實際 require 成功；缺套件時 silent skip
 * 避免 dev 環境炸掉。
 */
async function loadOptionalSentry() {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{ init: (options: Record<string, unknown>) => void }>;

  return dynamicImport('@sentry/nextjs');
}

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await loadOptionalSentry();

    if (process.env.NEXT_RUNTIME === 'nodejs') {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
        // 預設關 PII（已加密）
        sendDefaultPii: false,
      });
      console.log('✅ Sentry server-side 已啟用');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      Sentry.init({
        dsn,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      });
    }
  } catch {
    console.warn('⚠️ SENTRY_DSN 已設定但 @sentry/nextjs 未安裝，跳過');
  }
}
