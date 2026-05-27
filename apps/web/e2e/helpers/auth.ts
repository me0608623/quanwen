import { Page, expect } from '@playwright/test';

/**
 * Phase A 後：一帳號全功能, role 只有 user/admin 真的有意義。
 * 預設 seed 三個帳號 (apps/api/src/db/seed.ts):
 *   - user@quanwen.com  / 000  → admin    (landing /admin)
 *   - user1@quanwen.com / 000  → 一般用戶  (landing /dashboard)
 *   - user2@quanwen.com / 000  → 一般用戶  (landing /dashboard)
 *
 * 「surveyor / respondent」這兩個鍵保留是給 legacy spec 引用,語意上都對映一般用戶 (#1 / #2)。
 */
export const ACCOUNTS = {
  admin:      { email: 'user@quanwen.com',  password: '000', landing: '/admin' as const },
  surveyor:   { email: 'user1@quanwen.com', password: '000', landing: '/dashboard' as const },
  respondent: { email: 'user2@quanwen.com', password: '000', landing: '/dashboard' as const },
  // 別名
  aa:         { email: 'user2@quanwen.com', password: '000', landing: '/dashboard' as const },
  bb:         { email: 'user1@quanwen.com', password: '000', landing: '/dashboard' as const },
  cc:         { email: 'user@quanwen.com',  password: '000', landing: '/admin' as const },
};

export async function login(page: Page, who: keyof typeof ACCOUNTS) {
  const acc = ACCOUNTS[who];
  await page.goto('/auth/login');
  await page.getByLabel(/email|帳號/i).first().fill(acc.email);
  await page.getByLabel(/密碼|password/i).first().fill(acc.password);
  // 用 exact = '登入' 避免匹到「用 Google 登入」「用 LINE 登入」OAuth buttons
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await page.waitForURL(new RegExp(acc.landing), { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.goto('/');
  // 點頭像 dropdown → 登出
  const logoutBtn = page.getByRole('button', { name: /登出|logout/i });
  if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await logoutBtn.click();
  }
  await page.context().clearCookies();
}

export async function expectAuthenticated(page: Page, expectedLanding: '/admin' | '/dashboard' | '/tasks') {
  await expect(page).toHaveURL(new RegExp(expectedLanding));
}
