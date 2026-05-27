import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // P1: 產生 .next/standalone（apps/web/Dockerfile 會複製它 + server.js）。
  // pnpm monorepo 必須同時設 outputFileTracingRoot 指向 workspace root，
  // 否則 standalone 會漏掉 workspace 依賴 / server.js 路徑錯位。
  output: 'standalone',
  experimental: {
    // ../../ = quanwen/（pnpm-workspace.yaml 所在的 monorepo root）
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // lint 由獨立的 CI job（pnpm lint / next lint）負責;build 不重複 lint，
  // 避免「加了 eslint config 後 next build 開始 lint」把原本綠的 build job 弄紅。
  eslint: { ignoreDuringBuilds: true },
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

};

export default nextConfig;
