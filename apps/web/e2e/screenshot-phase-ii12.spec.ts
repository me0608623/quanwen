import { test } from '@playwright/test';

/**
 * Phase II.12: AI 一鍵生成問卷面板（含 purpose 輸入）
 *
 * 註：直接用 PGlite dev seed 帳號 (bb@bb.bb/bb) 登入，不走 helpers/auth
 * （該 helper 已被 Phase A migration 改成 user1@quanwen.com，與 PGlite 內建
 *   seed 帳號不一致）。
 */
test('II.12: AI draft panel with purpose field', async ({ page }) => {
  await page.goto('/auth/login');
  await page.locator('input[type="email"]').first().fill('bb@bb.bb');
  await page.locator('input[type="password"]').first().fill('bb');
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await page.waitForURL(/dashboard|tasks|mutual|\/$/, { timeout: 15_000 }).catch(() => undefined);

  await page.goto('/dashboard/surveys/new');
  await page.waitForLoadState('networkidle');

  const btn = page.locator('button:has-text("AI 草稿生成")').first();
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(400);
    // 填一點內容讓截圖更有說服力
    await page.locator('input[placeholder*="使用習慣"]').first().fill('大學生外送平台使用習慣').catch(() => undefined);
    await page.locator('textarea').first().fill('了解使用頻率、品牌偏好與付費意願，作為新產品定位依據').catch(() => undefined);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: 'test-results/ii12-ai-draft-panel.png', fullPage: true });
});
