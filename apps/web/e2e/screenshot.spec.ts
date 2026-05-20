import { test } from '@playwright/test';
import { login } from './helpers/auth';

// Phase M 用：快速 demo screenshot 各 role 關鍵頁
test.describe('Demo screenshots', () => {
  test('aa profile 含品質區塊', async ({ page }) => {
    await login(page, 'aa');
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/screenshot-aa-profile.png', fullPage: true });
  });

  test('bb dashboard 含問卷列表', async ({ page }) => {
    await login(page, 'bb');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/screenshot-bb-dashboard.png', fullPage: true });
  });

  test('cc admin overview', async ({ page }) => {
    await login(page, 'cc');
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/screenshot-cc-admin.png', fullPage: true });
  });

  test('cc 申訴管理頁', async ({ page }) => {
    await login(page, 'cc');
    await page.goto('/admin/appeals');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/screenshot-cc-appeals.png', fullPage: true });
  });
});
