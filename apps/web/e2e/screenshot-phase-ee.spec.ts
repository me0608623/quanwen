import { test } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Phase EE: profile 頁 reputation_history recharts 升級
 */
test('EE: profile 頁 信譽分趨勢 chart', async ({ page }) => {
  await login(page, 'aa');
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/ee-profile-rep-trend.png', fullPage: true });
});
