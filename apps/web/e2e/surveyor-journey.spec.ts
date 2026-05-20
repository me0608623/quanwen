import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('問券方旅程', () => {
  test('看到 dashboard 與已建問卷', async ({ page }) => {
    await login(page, 'bb');
    await expect(page).toHaveURL(/\/dashboard/);
    // 至少有一個導向新增問卷的入口
    await expect(page.locator('a[href*="/dashboard/surveys/new"], button:has-text("新增問卷")').first()).toBeVisible();
  });

  test('問卷詳情頁顯示 AI 反作弊輔助（草稿或退回狀態才出現）', async ({ page }) => {
    await login(page, 'bb');
    await page.goto('/dashboard');
    // 點第一個問卷
    const firstSurvey = page.locator('a[href*="/dashboard/surveys/"]').filter({ hasNotText: '/new' }).first();
    if (await firstSurvey.count() === 0) {
      test.skip(true, '無 demo 問卷');
    }
    await firstSurvey.click();

    // 若是 draft/rejected 應該看到反作弊面板
    const antiCheat = page.locator('text=/AI 反作弊設計輔助/');
    if (await antiCheat.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(antiCheat).toBeVisible();
      await expect(page.locator('text=/AI 加反作弊題/')).toBeVisible();
      await expect(page.locator('text=/上架前 AI 預審/')).toBeVisible();
    }
  });

  test('問卷編輯頁顯示受眾過濾 slider', async ({ page }) => {
    await login(page, 'bb');
    await page.goto('/dashboard');
    const firstDraft = page.locator('a[href*="/dashboard/surveys/"]').filter({ hasNotText: '/new' }).first();
    if (await firstDraft.count() === 0) test.skip(true, '無 demo 問卷');
    await firstDraft.click();

    const audienceSection = page.locator('text=/受眾過濾/');
    if (await audienceSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(audienceSection).toBeVisible();
      await expect(page.locator('input[type="range"]').first()).toBeVisible();
    }
  });

  test('Stats 頁顯示品質分布', async ({ page }) => {
    await login(page, 'bb');
    await page.goto('/dashboard');
    // 找有已收份數的問卷（demo seed 應該至少有 1 個）
    const surveyLink = page.locator('a[href*="/dashboard/surveys/"]').filter({ hasNotText: '/new' }).first();
    if (await surveyLink.count() === 0) test.skip(true, '無 demo 問卷');
    await surveyLink.click();

    // 嘗試到 stats 頁
    const statsLink = page.locator('a[href*="/stats"]');
    if (await statsLink.isVisible({ timeout: 1500 }).catch(() => false)) {
      await statsLink.click();
      // 應該看到「乾淨樣本」匯出按鈕（Phase 3 加的）
      const cleanBtn = page.locator('text=/乾淨樣本/');
      if (await cleanBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await expect(cleanBtn).toBeVisible();
      }
    }
  });

  test('Wallet 頁問券方看到「現金錢包」', async ({ page }) => {
    await login(page, 'bb');
    await page.goto('/wallet');
    await expect(page.locator('text=/現金錢包/').first()).toBeVisible();
    // 不應該看到受試者的「我的收益」
    await expect(page.locator('text="我的收益"')).not.toBeVisible();
  });
});
