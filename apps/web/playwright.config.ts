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
  retries: process.env.CI ? 2 : 0,
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
          command: 'pnpm --filter web dev',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : undefined,
});
