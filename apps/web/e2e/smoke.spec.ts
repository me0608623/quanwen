import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Smoke', () => {
  test('homepage 載入無錯', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/券問|QuanWen/i);
  });

  test('登入頁可開啟', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: '登入', exact: true })).toBeVisible();
  });

  test('admin 登入 → /admin', async ({ page }) => {
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/admin/);
  });

  test('一般用戶 (user1) 登入 → /dashboard', async ({ page }) => {
    await login(page, 'surveyor');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('一般用戶 (user2) 登入 → /dashboard', async ({ page }) => {
    await login(page, 'respondent');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('一般用戶看得到 3 個 tab (發問卷 / 填問卷 / 互惠)', async ({ page }) => {
    await login(page, 'surveyor');
    await expect(page.getByRole('link', { name: '發問卷' })).toBeVisible();
    await expect(page.getByRole('link', { name: '填問卷' })).toBeVisible();
    await expect(page.getByRole('link', { name: '互惠' })).toBeVisible();
  });
});
