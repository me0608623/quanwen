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
  reporter: process.env.CI ? 'github' : 'list',
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
          command: 'pnpm --filter api dev',
          url: 'http://localhost:3001/api/v1/health',
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
