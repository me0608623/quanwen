import { test } from '@playwright/test';
import { login } from './helpers/auth';

test('GG: respondent wallet earnings chart', async ({ page }) => {
  await login(page, 'aa');
  await page.goto('/wallet');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/gg-wallet-earnings-chart.png', fullPage: true });
});
