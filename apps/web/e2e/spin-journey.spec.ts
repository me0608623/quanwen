/**
 * 轉盤抽獎 E2E
 *
 * 鎖住兩件事的回歸：
 *  1. 中央 SPIN 是「可互動的 <button>」（曾經是純裝飾 <div>，點了不會轉）。
 *  2. 有次數 → 點中央 → 轉動中 → 中獎結果顯示；沒次數 → 灰化 + 去填問卷 CTA。
 *
 * 策略：
 *  - Test 1/2 用 page.route mock 後端 + reducedMotion 跳過 4.6s 動畫 → 完全 deterministic。
 *  - Test 3 跑真實「填問卷 → 送出」流程（earn 半段），轉盤部分機會性執行
 *    （grantChance 在品質審核通過後才發、且為 async，故不 hard-fail）。
 */
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// 與 apps/api/src/spin/spin.service.ts 的 SPIN_SEGMENTS 對齊（取含 jackpot 的子集即可）
const SEGMENTS = [
  { key: 'p5', label: '5 點', points: 5, weight: 26, color: '#94a3b8' },
  { key: 'p100', label: '100 點', points: 100, weight: 5, color: '#fb7185' },
  { key: 'jackpot', label: '大獎 200 點', points: 200, weight: 2, color: '#f59e0b' },
];

function statusBody(over: Partial<Record<string, unknown>> = {}) {
  return {
    availableChances: 3,
    earnedTotal: 3,
    spentTotal: 0,
    canSpin: true,
    lastSpin: null,
    segments: SEGMENTS,
    ...over,
  };
}

/** 攔截 /spin/status（GET）與 /spin（POST）。statusOver 可覆寫成沒次數情境。 */
async function mockSpin(page: Page, statusOver: Partial<Record<string, unknown>> = {}) {
  await page.route('**/api/v1/spin/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusBody(statusOver)) }),
  );
  await page.route('**/api/v1/spin', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prizeKey: 'jackpot', label: '大獎 200 點', pointsWon: 200, availableChances: 2 }),
    });
  });
}

test.describe('轉盤抽獎', () => {
  // 跳過 GSAP 4.6s 動畫：reduced-motion 時 handleSpin 直接 finish()，結果即時出現
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('中央 SPIN 是可互動 <button>（回歸鎖：不可是裝飾 div）', async ({ page }) => {
    await mockSpin(page);
    await login(page, 'aa');
    await page.goto('/spin');

    const hub = page.locator('[data-spin-hub]');
    await expect(hub).toBeVisible({ timeout: 10_000 });
    // 核心回歸：必須是 button 元素，且可點
    await expect(hub).toHaveJSProperty('tagName', 'BUTTON');
    await expect(hub).toBeEnabled();
    await expect(hub).toHaveText(/SPIN/);
  });

  test('有次數 → 點中央 → 中獎結果顯示', async ({ page }) => {
    await mockSpin(page);
    await login(page, 'aa');
    await page.goto('/spin');

    const hub = page.locator('[data-spin-hub]');
    await expect(hub).toBeEnabled({ timeout: 10_000 });
    await hub.click();

    // reduced-motion → 立即出結果。中獎文案：🎉 恭喜！大獎 200 點 + 200 積分已存入錢包
    await expect(page.getByText(/恭喜/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/200 積分已存入錢包/)).toBeVisible();
    // 中獎後可見「去商城兌換 / 查看錢包」連結
    await expect(page.getByRole('link', { name: /商城|錢包/ }).first()).toBeVisible();
  });

  test('沒次數 → 中央灰化「沒次數」+ 去填問卷 CTA', async ({ page }) => {
    await mockSpin(page, { availableChances: 0, canSpin: false });
    await login(page, 'aa');
    await page.goto('/spin');

    const hub = page.locator('[data-spin-hub]');
    await expect(hub).toBeVisible({ timeout: 10_000 });
    await expect(hub).toBeDisabled();
    await expect(hub).toHaveText(/沒次數/);
    await expect(page.getByRole('link', { name: /去填問卷賺次數/ })).toBeVisible();
  });

  test('真實流程：填 DEMO 問卷 → 送出（earn 半段，轉盤機會性）', async ({ page }) => {
    await login(page, 'aa');
    await page.goto('/tasks');

    const task = page.locator('a[href*="/tasks/"]').first();
    // 等 TanStack Query 載入後再判斷（避免在載入中誤判為空而 skip）
    const hasTask = await task.isVisible({ timeout: 8_000 }).catch(() => false);
    test.skip(!hasTask, '無可填問卷');
    await task.click();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });

    // 通用填答：每組單選/多選點第一個、文字題填足夠長度（避過 anti-cheat 太短）
    for (const radio of await page.locator('input[type="radio"]').all()) {
      await radio.check({ force: true }).catch(() => null);
    }
    for (const ta of await page.locator('textarea, input[type="text"]').all()) {
      await ta.fill('我平常很重視手機的續航力與相機表現，這是我選擇的主要原因。').catch(() => null);
    }
    // 給一點停留時間，避免被判定為「填太快」而退件
    await page.waitForTimeout(2500);

    const submit = page.getByRole('button', { name: /提交|送出|完成/ });
    test.skip(!(await submit.first().isVisible({ timeout: 2000 }).catch(() => false)), '此問卷無可用提交鈕');
    await submit.first().click();

    // earn 半段回歸鎖：送出後應有成功跡象（離開填答頁 / 出現感謝或品質提示）
    await expect
      .poll(async () => {
        const url = page.url();
        const done = await page.getByText(/感謝|已送出|提交成功|品質|審核/).first().isVisible().catch(() => false);
        return done || !/\/tasks\/[0-9a-f-]{36}/.test(url);
      }, { timeout: 15_000 })
      .toBeTruthy();

    // 轉盤機會性：審核通過才會有次數（async），有就轉一下，沒有不算失敗
    await page.goto('/spin');
    const hub = page.locator('[data-spin-hub]');
    await expect(hub).toBeVisible({ timeout: 10_000 });
    if (await hub.isEnabled().catch(() => false)) {
      await hub.click();
      await expect(page.getByText(/恭喜|銘謝/)).toBeVisible({ timeout: 10_000 });
    }
  });
});
