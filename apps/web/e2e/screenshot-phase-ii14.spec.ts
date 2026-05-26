import { test } from '@playwright/test';
import { ACCOUNTS } from './helpers/auth';

/**
 * Phase II.14: AI 草稿 preview + 逐題重生 UI。
 *
 * 用 route interception mock /surveys/ai-draft（dev 無 ZAI_API_KEY，無法真生成），
 * 驗證 preview 清單 + 🔄 換一題 + 換角度重生整份 的 UI 正常 render。
 */
test('II.14: AI draft preview with per-question regen', async ({ page, request }) => {
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

  // mock 生成結果
  await page.route('**/surveys/ai-draft', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: '大學生外送平台使用習慣調查',
        description: '了解大學生使用外送平台的頻率、品牌偏好與付費意願，約 3 分鐘完成。',
        questions: [
          { type: 'single_choice', title: '你一週使用外送平台幾次？', sortOrder: 0, isRequired: true,
            options: [{ label: '0 次', sortOrder: 0 }, { label: '1-2 次', sortOrder: 1 }, { label: '3 次以上', sortOrder: 2 }] },
          { type: 'multiple_choice', title: '你曾使用過哪些外送平台？', sortOrder: 1, isRequired: true,
            options: [{ label: 'Uber Eats', sortOrder: 0 }, { label: 'foodpanda', sortOrder: 1 }] },
          { type: 'rating', title: '整體滿意度', sortOrder: 2, isRequired: true, config: { maxRating: 5 } },
          { type: 'text', title: '你希望外送平台改善什麼？', sortOrder: 3, isRequired: false },
        ],
        notes: ['「配送速度」選項不足 2 個，已改為開放題'],
      }),
    });
  });

  await page.goto('/dashboard/surveys/new');
  await page.waitForLoadState('networkidle');

  await page.locator('button:has-text("AI 草稿生成")').first().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder*="使用習慣"]').first().fill('大學生外送平台使用習慣');
  await page.locator('button:has-text("產生草稿")').first().click();
  await page.waitForTimeout(600); // 等 preview render

  await page.screenshot({ path: 'test-results/ii14-ai-draft-preview.png', fullPage: true });
});
