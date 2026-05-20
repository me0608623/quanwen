import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('管理員旅程', () => {
  test('Overview 顯示快捷入口（含新加的 申訴 + KYC）', async ({ page }) => {
    await login(page, 'cc');
    await expect(page).toHaveURL(/\/admin/);

    // Phase 6/B 新增的入口
    await expect(page.locator('a[href="/admin/appeals"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/kyc"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/surveys"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/withdrawals"]')).toBeVisible();
  });

  test('申訴管理頁顯示 tab', async ({ page }) => {
    await login(page, 'cc');
    await page.goto('/admin/appeals');
    await expect(page.locator('text=/申訴管理/')).toBeVisible();
    await expect(page.locator('button:has-text("待處理")')).toBeVisible();
    await expect(page.locator('button:has-text("已通過")')).toBeVisible();
    await expect(page.locator('button:has-text("已駁回")')).toBeVisible();
  });

  test('KYC 審核頁顯示說明文字', async ({ page }) => {
    await login(page, 'cc');
    await page.goto('/admin/kyc');
    await expect(page.locator('h1:has-text("KYC 身份驗證審核")')).toBeVisible();
    await expect(page.locator('text=/AES-256-GCM/')).toBeVisible();
  });

  test('可疑填答頁可開啟', async ({ page }) => {
    await login(page, 'cc');
    await page.goto('/admin/responses');
    // 頁面載入無錯即可
    await expect(page).toHaveURL(/\/admin\/responses/);
  });

  test('問卷審核頁可開啟', async ({ page }) => {
    await login(page, 'cc');
    await page.goto('/admin/surveys');
    await expect(page).toHaveURL(/\/admin\/surveys/);
  });
});
