import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
// 從 monorepo root 載入 .env
config({ path: resolve(__dirname, '../../../.env') });

import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { parseAllowedOrigins, isValidOriginList } from './deployment/web-origins';

// Treat placeholder values from .env.example as "not set"
const isPlaceholder = (v: string | undefined) =>
  !v || v.startsWith('your_') || v === '';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development'),
  PORT: z.string().regex(/^\d+$/).optional(),
  WEB_URL: z.string().optional().refine(
    (value) => !value || isValidOriginList(value),
    'WEB_URL must be a valid URL or a comma/space separated list of valid URLs',
  ),
  CORS_ORIGINS: z.string().optional().refine(
    (value) => !value || isValidOriginList(value),
    'CORS_ORIGINS must be a valid comma/space separated list of URLs',
  ),

  // P2/P3/P4: Redis（限流共享 storage + cron 分散式鎖 + readiness）。
  // 未設 → throttler 降級 in-memory、cron 直接執行、readiness 回報 redis down。
  REDIS_URL: z.string().optional(),

  // Phase B: PII 加密金鑰（prod 必設，dev 用 fallback）
  PII_ENCRYPTION_KEY: z.string().min(16).optional(),
  PII_KDF_SALT: z.string().min(8).optional(),

  // OAuth providers are all optional — each is enabled when its required vars are set
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  LINE_CHANNEL_ID: z.string().optional(),
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CALLBACK_URL: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  APPLE_CALLBACK_URL: z.string().optional(),

  // SMTP is optional (falls back to defaults); warn in production if missing
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // ECPay（prod 才啟用）
  ECPAY_MERCHANT_ID: z.string().optional(),
  ECPAY_HASH_KEY: z.string().optional(),
  ECPAY_HASH_IV: z.string().optional(),
  ECPAY_PAYMENT_URL: z.string().optional(),

  // Z.ai LLM
  ZAI_API_KEY: z.string().optional(),
  ZAI_BASE_URL: z.string().optional(),

  // Sentry observability — 接受任何字串（包括 placeholder），下游 init 自己判斷
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().regex(/^0(\.\d+)?|1(\.0)?$/).optional(),
});

const envResult = envSchema.safeParse(process.env);
if (!envResult.success) {
  console.error('❌ 缺少必要的環境變數，請檢查 .env 設定：');
  for (const issue of envResult.error.issues) {
    console.error(`  • ${String(issue.path[0])}: ${issue.message}`);
  }
  process.exit(1);
}

// Phase O.2: Production 強制檢查（dev 只警告，prod 直接 fail）
const isProd = process.env.NODE_ENV === 'production';
const prodRequired: Array<[string, string]> = [
  ['PII_ENCRYPTION_KEY', 'PII 加密金鑰必設，否則身分證 / 銀行帳號無法安全儲存'],
  ['WEB_URL', 'CORS 需要 WEB_URL；prod 缺會 fallback localhost'],
  // ECPay cancelled per pivot — made optional
];
const prodRecommended: Array<[string, string]> = [
  ['PII_KDF_SALT', '建議設一個隨機 16-byte hex 加強 scrypt KDF'],
  ['SENTRY_DSN', '建議接 Sentry 才能在 prod 看 error stack'],
  ['SMTP_HOST', '通知 / 忘記密碼 email 無法寄出'],
  ['ZAI_API_KEY', 'AI 品質審核 / 反作弊建議將 fail-open'],
];
if (isProd) {
  const missing = prodRequired.filter(([k]) => !process.env[k] || (process.env[k] as string).trim() === '');
  if (missing.length > 0) {
    console.error('❌ Production 缺少必要環境變數：');
    for (const [k, why] of missing) console.error(`  • ${k}: ${why}`);
    process.exit(1);
  }
  const missingRec = prodRecommended.filter(([k]) => !process.env[k]);
  for (const [k, why] of missingRec) {
    console.warn(`⚠️  Production 建議設 ${k}：${why}`);
  }
}

const googleReady =
  !isPlaceholder(process.env.GOOGLE_CLIENT_ID) &&
  !isPlaceholder(process.env.GOOGLE_CLIENT_SECRET);
const lineReady =
  !isPlaceholder(process.env.LINE_CHANNEL_ID) &&
  !isPlaceholder(process.env.LINE_CHANNEL_SECRET);
const appleReady =
  !isPlaceholder(process.env.APPLE_CLIENT_ID) &&
  !isPlaceholder(process.env.APPLE_PRIVATE_KEY);
console.log('🔐 OAuth providers:',
  googleReady ? '✅ Google' : '⚠️ Google (未設定)',
  lineReady ? '✅ LINE' : '⚠️ LINE (未設定)',
  appleReady ? '✅ Apple' : '⚠️ Apple (未設定)',
);

if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
  console.warn('⚠️  SMTP_HOST 未設定，忘記密碼郵件功能將無法使用');
}
// ECPay cancelled per pivot — no warning needed

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { runStartupSchemaAlignment } from './db/startup-schema-align';

// Phase F.2: Sentry SDK skeleton（env-gated；安裝 @sentry/node 後解開 require）
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || isPlaceholder(dsn) || !dsn.startsWith('http')) return;
  try {
    // 套件需要 pnpm install @sentry/node @sentry/profiling-node 才會解析；
    // 用 dynamic require 避開靜態 import 解析錯誤
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      // 把 PII 預設關掉（已加密）— 用戶 ID 仍會被送但 email 等不會
      sendDefaultPii: false,
    });
    console.log('✅ Sentry 已啟用');
  } catch {
    console.warn('⚠️ SENTRY_DSN 已設定但 @sentry/node 未安裝，跳過');
  }
}
initSentry();

async function bootstrap() {
  // Prestart: align live schema before accepting traffic (root-cause fix for
  // recurring Neon schema drift — idempotent, best-effort, never blocks boot).
  await runStartupSchemaAlignment();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Enable URL-encoded body parsing (needed for Apple Sign In form_post callback)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const expressApp = app.getHttpAdapter().getInstance() as { use: (...args: unknown[]) => void };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expressApp.use(require('express').urlencoded({ extended: true }));

  // Cookie parsing — needed for mobile OAuth deep-link detection (oauth_mobile cookie)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expressApp.use(require('cookie-parser')());

  type RequestWithContext = Request & { requestId?: string };

  expressApp.use((req: RequestWithContext, res: Response, next: NextFunction) => {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim() !== ''
        ? requestIdHeader
        : randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        level: 'info',
        msg: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        timestamp: new Date().toISOString(),
      }));
    });

    next();
  });

  // Phase K.1: Helmet 安全 headers（X-Frame-Options/HSTS/X-Content-Type-Options 等）
  // contentSecurityPolicy 在 dev 關掉以免擋 Swagger/Next.js dev assets；prod 開啟
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const helmet = require('helmet');
  expressApp.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false, // 避免擋外部 OAuth iframe
  }));

  // 上傳檔案靜態服務:UploadService 落地在 <cwd>/uploads,對外以 /uploads/* 取用
  // CORP 設 cross-origin,讓前端(不同 origin)能以 <img> 載入;否則被 helmet 的 same-origin 擋下
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const expressStatic = require('express').static;
  expressApp.use(
    '/uploads',
    expressStatic(resolve(process.cwd(), 'uploads'), {
      setHeaders: (res: Response) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );

  // CORS
  const allowedOrigins = Array.from(new Set([
    ...parseAllowedOrigins(process.env.WEB_URL),
    ...(process.env.CORS_ORIGINS ? parseAllowedOrigins(process.env.CORS_ORIGINS) : []),
  ]));
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });
  console.log(`🌐 CORS allowlist: ${allowedOrigins.join(', ')}`);

  // API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'ready'],
  });

  // Swagger (開發環境，opt-in 避免某些 controller 參數元資料缺失導致掃描失敗)
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_SWAGGER === '1') {
    const config = new DocumentBuilder()
      .setTitle('券問 QuanWen API')
      .setDescription('雙邊問卷媒合平台 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    console.log(`📚 Swagger UI: http://localhost:${process.env.PORT ?? 3001}/docs`);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api/v1`);
}

bootstrap();
