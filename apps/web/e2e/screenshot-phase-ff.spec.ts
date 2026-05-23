import { test } from '@playwright/test';
import { login } from './helpers/auth';

test('FF: admin overview survey status donut', async ({ page }) => {
  await login(page, 'cc');
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/ff-admin-overview-chart.png', fullPage: true });
});
