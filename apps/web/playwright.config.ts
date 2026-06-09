import { defineConfig, devices } from '@playwright/test';

/**
 * Phase C：Playwright 設定。
 *
 * 假設：
 * - Web dev server on http://localhost:3000 (apps/web)
 * - API dev server on http://localhost:3001 (apps/api，自動 seed aa/bb/cc 帳號)
 *
 * 跑法：
 *   pnpm --filter web test:e2e            # 全部
 *   pnpm --filter web test:e2e smoke      # 只跑 smoke
 *   pnpm --filter web test:e2e --headed   # 看到瀏覽器
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // demo 共用同個 DB，串行避免互卡
  forbidOnly: !!process.env.CI,
  // 斷言已對齊中文化 UI，且 web 改用 production build（next start，無首次編譯延遲）。
  // CI retries: 1 吸收完整串行跑後段偶發的導航 timeout（server 劣化偽失敗）。
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.CI
    ? [
        {
          // CI 用 build 產物啟動（job 已跑 pnpm --filter api build）。
          // 不能用 `dev`(nest start --watch)：nest-cli deleteOutDir 會先刪掉 build 的 dist
          // 再重編，race 導致 node dist/main MODULE_NOT_FOUND → webServer timeout。
          command: 'pnpm --filter api start',
          // health 在根路徑 /health（main.ts setGlobalPrefix exclude: ['health','ready']）；
          // 用 /api/v1/health 會 404 → Playwright 永遠等不到 ready → webServer timeout。
          url: 'http://localhost:3001/health',
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          // 用 production build（next start）跑 web：消除 next dev 首次路由編譯造成的
          // waitForURL 'load' 事件不穩 → 大量 timeout。CI job 在此前已跑 pnpm --filter web build。
          command: 'pnpm --filter web start',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : undefined,
});
