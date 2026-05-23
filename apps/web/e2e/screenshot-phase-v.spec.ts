import { test } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Phase V: stats 頁 chart 視覺化升級
 * 截圖確認 recharts 圖表（橫向 bar / donut / 垂直 bar）正常 render
 */
test('V: stats 頁 charts 視覺化', async ({ page }) => {
  await login(page, 'bb');
  await page.goto('/dashboard/surveys/33333333-3333-3333-3333-333333333301/stats');
  await page.waitForLoadState('networkidle');
  // 給 recharts 一點時間繪製
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/v-stats-charts.png', fullPage: true });
});
