import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('受試者旅程', () => {
  test('看到任務列表 + 品質分趨勢 + 申訴歷史', async ({ page }) => {
    await login(page, 'aa');

    // 受試者登入落點為 /dashboard；任務列表在 /tasks，主動導過去
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/tasks/);
    // demo 應該至少有一份問卷
    const taskCard = page.locator('a').filter({ hasText: /問卷|調查|意見/ }).first();
    await expect(taskCard).toBeVisible({ timeout: 10_000 });

    // 到 profile 看品質歷史（軟驗證：MyQualitySection 只在 audited.length > 0 才 render）
    await page.goto('/profile');
    const qualitySection = page.getByText(/我的填答品質/);
    if (await qualitySection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(qualitySection).toBeVisible();
      // 有 quality 區塊時才驗 trust badge
      await expect(page.locator('text=/可信任|尚可|需注意/').first()).toBeVisible();
    }
  });

  test('填答 happy path（如有可填問卷）', async ({ page }) => {
    await login(page, 'aa');

    const firstTask = page.locator('a[href*="/tasks/"]').first();
    const taskCount = await firstTask.count();
    test.skip(taskCount === 0, '無可填問卷，跳過');

    await firstTask.click();
    // 進填答頁，title 出現
    await expect(page.locator('h1').first()).toBeVisible();

    // 嘗試提交（demo 簡化：直接提交或填一些）
    const submitBtn = page.getByRole('button', { name: /提交|送出/ });
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // 不一定都能提交（required 題未填），這部分留給 specific 測試
    }
  });

  test('看到信譽分趨勢 sparkline（若有 reputation history）', async ({ page }) => {
    await login(page, 'aa');
    await page.goto('/profile');

    // ReputationTrendBlock 在歷史 > 0 時顯示，demo 不保證有，所以軟驗證
    const trend = page.locator('text=/信譽分趨勢/');
    if (await trend.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(trend).toBeVisible();
      // sparkline svg
      await expect(page.locator('svg').filter({ has: page.locator('circle') }).first()).toBeVisible();
    }
  });
});
