import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isMobile = process.env.BUILD_TARGET === 'mobile';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Mobile (static export) ──────────────────────────────────────────
  // Capacitor 需要純靜態 HTML/JS/CSS，打包進 APK 本地載入。
  // Web 部署維持 standalone（Docker/SSR）。
  ...(isMobile
    ? {
        output: 'export',
        export: {
          mode: 'static',
          // 產出動態路由的 fallback HTML
        },
        images: { unoptimized: true },
        // 讓動態路由產出 fallback HTML（Next 16 export 需要）
        generateBuildId: async () => {
          return 'mobile-static';
        },
        // static export 不支援 headers() / rewrites()，略過
      }
    : {
        // ── Web (standalone SSR) ─────────────────────────────────────────
        output: 'standalone',
        outputFileTracingRoot: path.join(__dirname, '../../'),
        images: {
          remotePatterns: [
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
            { protocol: 'https', hostname: 'profile.line-scdn.net' },
            { protocol: 'https', hostname: '*.line-scdn.net' },
            { protocol: 'https', hostname: 'appleid.cdn-apple.com' },
          ],
        },
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
      }),
  transpilePackages: ['shared-types'],
};

export default nextConfig;
