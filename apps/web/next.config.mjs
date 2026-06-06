import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // P1: 產生 .next/standalone（apps/web/Dockerfile 會複製它 + server.js）。
  // pnpm monorepo 必須同時設 outputFileTracingRoot 指向 workspace root，
  // 否則 standalone 會漏掉 workspace 依賴 / server.js 路徑錯位。
  output: 'standalone',
  // Next.js 15: outputFileTracingRoot moved from experimental to top-level
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['shared-types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'profile.line-scdn.net' },
      { protocol: 'https', hostname: '*.line-scdn.net' },
      { protocol: 'https', hostname: 'appleid.cdn-apple.com' },
    ],
  },
  // typedRoutes: 等 /dashboard 和 /tasks 頁面建好後再啟用

  // 安全 headers：防點擊劫持 / MIME 嗅探 / referrer 外洩（API 端有 helmet，前端頁面這裡補上）。
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
