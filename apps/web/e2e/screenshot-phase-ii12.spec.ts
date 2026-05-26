import { test } from '@playwright/test';
import { ACCOUNTS } from './helpers/auth';

/**
 * Phase II.12: AI 一鍵生成問卷面板（含 purpose 輸入）
 *
 * 用 localStorage 注入 token 登入（繞過 login 頁面表單），避免受 auth 頁
 * 行為變動影響此截圖測試。帳號用 PGlite seed 的 user1@quanwen.com（與
 * seed.ts / helper 一致）。
 */
test('II.12: AI draft panel with purpose field', async ({ page, request }) => {
  // 直接打 API 拿 token（seed 帳號已與 seed.ts 同步）
  const res = await request.post('http://localhost:3001/api/v1/auth/login', {
    data: { email: ACCOUNTS.bb.email, password: ACCOUNTS.bb.password },
  });
  const { token } = await res.json();

  await page.addInitScript((t) => {
    localStorage.setItem('qw_token', t as string);
    document.cookie = `qw_token=${t as string}; path=/; max-age=604800; SameSite=Lax`;
  }, token);
  await page.context().addCookies([
    { name: 'qw_token', value: token, domain: 'localhost', path: '/' },
  ]);

  await page.goto('/dashboard/surveys/new');
  await page.waitForLoadState('networkidle');

  const btn = page.locator('button:has-text("AI 草稿生成")').first();
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(400);
    await page.locator('input[placeholder*="使用習慣"]').first().fill('大學生外送平台使用習慣').catch(() => undefined);
    await page.locator('textarea').first().fill('了解使用頻率、品牌偏好與付費意願，作為新產品定位依據').catch(() => undefined);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: 'test-results/ii12-ai-draft-panel.png', fullPage: true });
});
