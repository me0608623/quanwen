import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers/auth';

test.describe('Smoke', () => {
  test('homepage 載入無錯', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/券問|QuanWen/i);
  });

  test('登入頁可開啟', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: /登入|sign in/i })).toBeVisible();
  });

  test('受試者 aa 可登入並看到 /tasks', async ({ page }) => {
    await login(page, 'aa');
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('問券方 bb 可登入並看到 /dashboard', async ({ page }) => {
    await login(page, 'bb');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('admin cc 可登入並看到 /admin', async ({ page }) => {
    await login(page, 'cc');
    await expect(page).toHaveURL(/\/admin/);
  });
});
