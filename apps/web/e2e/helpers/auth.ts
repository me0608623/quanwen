import { Page, expect } from '@playwright/test';

/** demo 帳號 — 由 API 在啟動時自動 seed */
export const ACCOUNTS = {
  aa: { email: 'aa@aa.aa', password: 'aa', role: 'respondent' as const, landing: '/tasks' },
  bb: { email: 'bb@bb.bb', password: 'bb', role: 'surveyor' as const,  landing: '/dashboard' },
  cc: { email: 'cc@cc.cc', password: 'cc', role: 'admin' as const,     landing: '/admin' },
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
  // 嘗試點登出按鈕（位置可能在 navbar）
  const logoutBtn = page.getByRole('button', { name: /登出|logout/i });
  if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await logoutBtn.click();
  }
  await page.context().clearCookies();
}

export async function expectAuthenticated(page: Page, expectedRole: 'respondent' | 'surveyor' | 'admin') {
  // 確認進入該 role 的 landing 頁
  const landing = ACCOUNTS[expectedRole === 'respondent' ? 'aa' : expectedRole === 'surveyor' ? 'bb' : 'cc'].landing;
  await expect(page).toHaveURL(new RegExp(landing));
}
