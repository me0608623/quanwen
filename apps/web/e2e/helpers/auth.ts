import { Page, expect } from '@playwright/test';

export const ACCOUNTS = {
  admin: { email: 'user@quanwen.com', password: '000', landing: '/admin' as const },
  surveyor: { email: 'user1@quanwen.com', password: '000', landing: '/dashboard' as const },
  respondent: { email: 'user2@quanwen.com', password: '000', landing: '/dashboard' as const },
  aa: { email: 'user2@quanwen.com', password: '000', landing: '/dashboard' as const },
  bb: { email: 'user1@quanwen.com', password: '000', landing: '/dashboard' as const },
  cc: { email: 'user@quanwen.com', password: '000', landing: '/admin' as const },
};

export async function login(page: Page, who: keyof typeof ACCOUNTS) {
  const acc = ACCOUNTS[who];
  // 先清既有 session：否則已登入時 /auth/login 會被 middleware 重導走（拿不到表單），
  // 跨帳號切換（如先登 aa 再登 bb）就會卡住。
  await page.context().clearCookies();
  // 在頁面載入前預先設 flag，讓歡迎 modal 不在 E2E 中出現（等同已確認的回訪用戶）。
  await page.addInitScript(() => localStorage.setItem('quanwen_welcome_seen', '1'));
  await page.goto('/auth/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(acc.email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(acc.password);
  await page.locator('button[type="submit"]').first().click();

  if (who === 'admin') {
    await page.waitForURL(/\/(admin|dashboard)/, { timeout: 15_000, waitUntil: 'commit' });
    return;
  }

  await page.waitForURL(new RegExp(acc.landing), { timeout: 15_000, waitUntil: 'commit' });
}

export async function logout(page: Page) {
  await page.goto('/');
  const logoutBtn = page.getByRole('button', { name: /logout/i });
  if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await logoutBtn.click();
  }
  await page.context().clearCookies();
}

export async function expectAuthenticated(page: Page, expectedLanding: '/admin' | '/dashboard' | '/tasks') {
  await expect(page).toHaveURL(new RegExp(expectedLanding));
}
