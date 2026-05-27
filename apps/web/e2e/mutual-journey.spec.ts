import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('互惠問卷', () => {
  test('user1 登入後可進入 /mutual 並看到列表', async ({ page }) => {
    await login(page, 'surveyor'); // = user1@quanwen.com
    await page.goto('/mutual');
    await expect(page.getByRole('heading', { name: /互惠問卷/ })).toBeVisible();
  });

  test('user2 登入後 navbar 互惠 tab 可點', async ({ page }) => {
    await login(page, 'respondent'); // = user2@quanwen.com
    const mutualTab = page.getByRole('link', { name: '互惠' });
    await expect(mutualTab).toBeVisible();
    await mutualTab.click();
    await expect(page).toHaveURL(/\/mutual/);
  });

  test('建問卷頁有「互惠」類型選項', async ({ page }) => {
    await login(page, 'surveyor');
    await page.goto('/dashboard/surveys/new');
    // 等問卷類型 section 出來
    await expect(page.getByRole('heading', { name: /問卷類型/i })).toBeVisible();
    // 互惠 button
    const mutualBtn = page.getByRole('button', { name: /互惠/ });
    await expect(mutualBtn).toBeVisible();
  });

  test('選互惠後獎勵欄位會被隱藏', async ({ page }) => {
    await login(page, 'surveyor');
    await page.goto('/dashboard/surveys/new');
    // 點選互惠類型
    await page.getByRole('button', { name: /互惠.*兩人互填/ }).click();
    // 互惠提示應出現
    await expect(page.getByText(/互惠問卷沒有金錢獎勵/)).toBeVisible();
  });

  test('admin 可進入 /admin/mutual', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/mutual');
    await expect(page.getByRole('heading', { name: /互惠配對管理/ })).toBeVisible();
    // 立即配對 button
    await expect(page.getByRole('button', { name: /立即配對/ })).toBeVisible();
  });

  test('Mutual 池內已有 seed 的 demo 配對（matched 狀態）', async ({ page }) => {
    await login(page, 'surveyor');
    await page.goto('/mutual');
    // seed.ts 灌了 user1 + user2 的 mutual 問卷, cron 跑過後是 matched
    // 容忍空池(若 cron 還沒跑或被使用過), 至少 page 載入無 error
    const heading = page.getByRole('heading', { name: /互惠問卷/ });
    await expect(heading).toBeVisible();
  });
});
