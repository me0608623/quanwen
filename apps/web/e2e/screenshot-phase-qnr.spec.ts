import { test } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Phase U: 截 Phase Q (商城) + N (矩陣題 demo) + R (export buttons) 的瀏覽器畫面
 */
test.describe('Phase Q/N/R browser screenshots', () => {
  test('Q: shop catalog (aa 受試者，500 pts)', async ({ page }) => {
    await login(page, 'aa');
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/u-shop-catalog.png', fullPage: true });
  });

  test('Q: redeem one item then visit my-redemptions', async ({ page }) => {
    await login(page, 'aa');
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    // 等 list 載入後找一個負擔得起的便宜券（100 pts 7-11 NT$50）並按兌換
    const cheapItem = page.locator('text=/7-11 NT\\$50 禮券/').first();
    if (await cheapItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 找對應 button — 在卡片底部
      const card = page.locator('div').filter({ hasText: '7-11 NT$50 禮券' }).first();
      const redeemBtn = card.locator('button:has-text("立即兌換")').first();
      if (await redeemBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await redeemBtn.click();
        // 確認 modal 出現
        const confirmBtn = page.locator('button:has-text("確認兌換")');
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          // 截 modal 開啟狀態
          await page.screenshot({ path: 'test-results/u-shop-confirm-modal.png', fullPage: false });
          await confirmBtn.click();
          // alert 自動 dismiss 不會 block playwright
          page.on('dialog', (d) => d.accept().catch(() => undefined));
        }
      }
    }

    // 往 my-redemptions
    await page.goto('/shop/my-redemptions');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/u-shop-my-redemptions.png', fullPage: true });
  });

  test('N: 矩陣題 demo survey 填答頁', async ({ page }) => {
    await login(page, 'aa');
    // 直接走到展示問卷（含 skip logic + 矩陣題 + reverse pair）
    await page.goto('/tasks/33333333-3333-3333-3333-333333333306');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/u-survey-matrix-demo.png', fullPage: true });
  });

  test('R: 問券方 stats 頁 + 四個 export buttons', async ({ page }) => {
    await login(page, 'bb');
    await page.goto('/dashboard/surveys/33333333-3333-3333-3333-333333333301/stats');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/u-stats-with-exports.png', fullPage: true });
  });

  test('navbar 受試者新增「商城」入口', async ({ page }) => {
    await login(page, 'aa');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/u-navbar-with-shop.png', fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 100 } });
  });
});
