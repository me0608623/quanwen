/**
 * Phase O.3：Sentry client-side init（browser runtime）
 *
 * env-gated；缺 NEXT_PUBLIC_SENTRY_DSN 或 @sentry/nextjs 套件 → silent skip。
 * @sentry/nextjs 會在 build 時自動載入此檔。
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/nextjs');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
      // 預設關 session replay（隱私）；開了需要額外配置 redact
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      // PII redact
      sendDefaultPii: false,
      // 不要把 JWT token / cookie 上傳
      beforeSend(event: { request?: { cookies?: unknown; headers?: { authorization?: unknown } } }) {
        if (event.request?.cookies) delete event.request.cookies;
        if (event.request?.headers?.authorization) delete event.request.headers.authorization;
        return event;
      },
    });
  } catch {
    // 套件未裝；dev 環境常見，silent skip
  }
}
