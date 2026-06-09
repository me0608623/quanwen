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
