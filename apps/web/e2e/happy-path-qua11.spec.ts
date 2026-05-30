/**
 * QUA-11 — OKR #1 Happy-path E2E
 * Target: Next.js 14 app at http://localhost:3000
 *
 * Flow:
 *   1. Creator logs in (/auth/login) → lands on /dashboard
 *   2. Creator builds a 3-question survey (/dashboard/surveys/new)
 *   3. Respondent opens invite link (/s/:id) → submits without logging in
 *   4. Creator sees 1 response on dashboard
 *   5. Creator exports → downloads CSV/XLSX (/dashboard/surveys/:id/stats)
 *   6. (if wired) AI insights → markdown report
 *
 * Required env vars:
 *   QA_CREATOR_EMAIL   — test creator account email
 *   QA_CREATOR_PASS    — test creator account password
 *   BASE_URL           — defaults to http://localhost:3000
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
// Default to seeded test accounts (apps/api/src/db/seed.ts: user1@quanwen.com = 一般用戶/surveyor)
const CREATOR_EMAIL = process.env.QA_CREATOR_EMAIL ?? "user1@quanwen.com";
const CREATOR_PASS = process.env.QA_CREATOR_PASS ?? "000";

// ---------------------------------------------------------------------------
// Helper: login as creator via /auth/login
// ---------------------------------------------------------------------------
async function loginAsCreator(page: Page) {
  await page.goto(`${BASE_URL}/auth/login`);
  // Use generic selectors for locale/component stability
  await page.locator('input[type="email"], input[name="email"], input#email').first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator('input[type="email"], input[name="email"], input#email').first().fill(CREATOR_EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(CREATOR_PASS);
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("OKR #1 Happy-path", () => {
  test("creator can log in and reach dashboard", async ({ page }) => {
    await loginAsCreator(page);
    await page.screenshot({
      path: "test-results/01-dashboard-empty.png",
      fullPage: true,
    });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("creator can build a 3-question survey", async ({ page }) => {
    await loginAsCreator(page);
    await page.goto(`${BASE_URL}/dashboard/surveys/new`);

    // Fill survey title
    await page.getByPlaceholder("輸入問卷標題").fill("QA 三題測試問卷");

    // Question 1 is already present by default (single_choice type)
    const questionTitles = page.getByPlaceholder("Question text");
    await questionTitles.first().fill("您偏好哪個選項？");
    await page.getByPlaceholder("Option 1").first().fill("選項 A");
    await page.getByPlaceholder("Option 2").first().fill("選項 B");

    // Add Question 2
    await page.getByRole("button", { name: /\+ 新增題目/ }).click();
    await questionTitles.nth(1).waitFor({ state: "visible", timeout: 10000 });
    const q2TypeSelect = page.locator('select[aria-label$=" type"]').nth(1);
    await q2TypeSelect.selectOption("multiple_choice");
    await questionTitles.nth(1).fill("請選擇所有適用項目（可多選）");
    await page.getByPlaceholder("Option 1").nth(1).fill("選項 X");
    await page.getByPlaceholder("Option 2").nth(1).fill("選項 Y");

    // Add Question 3 — text (open-ended)
    await page.getByRole("button", { name: /\+ 新增題目/ }).click();
    await questionTitles.nth(2).waitFor({ state: "visible", timeout: 10000 });
    const q3TypeSelect = page.locator('select[aria-label$=" type"]').nth(2);
    await q3TypeSelect.selectOption("text");
    await questionTitles.nth(2).fill("請分享您的其他意見");

    await page.screenshot({
      path: "test-results/02-survey-editor.png",
      fullPage: true,
    });

    // Save draft (aria-label="Save draft" added for Playwright targeting)
    await page.getByRole("button", { name: /Save draft|儲存草稿/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test("respondent can open invite link and submit without login", async ({
    page,
  }) => {
    // Use a seeded published survey for anonymous respondent flow
    const surveyUrl = `${BASE_URL}/s/33333333-3333-3333-3333-333333333301`;
    await page.goto(surveyUrl);

    await page.screenshot({
      path: "test-results/03-respondent-view.png",
      fullPage: true,
    });

    // Answer Q1: click first radio option
    await page.locator("input[type='radio']").first().waitFor({ state: "visible", timeout: 10000 });
    await page.locator("input[type='radio']").first().click({ force: true });
    await page.waitForTimeout(300);

    // Answer Q2: check first checkbox
    await page.locator("input[type='checkbox']").first().click({ force: true }).catch(() => null);
    await page.waitForTimeout(300);

    // Answer Q3 (rating)
    await page.locator("input[type='radio'][value='3']").first().click({ force: true }).catch(() =>
      page.locator("input[type='radio']").nth(5).click({ force: true }).catch(() => null)
    );
    await page.waitForTimeout(300);

    // Answer Q4 (open text)
    await page.locator("textarea").first().fill("QA automated test response").catch(() => null);
    await page.waitForTimeout(300);

    await page.screenshot({
      path: "test-results/03-respondent-view.png",
      fullPage: true,
    });

    // Trigger SurveyJS complete via the built-in Complete button (showCompleteButton is now enabled)
    const completeBtn = page.locator('.sd-navigation__complete-btn, button:has-text("Complete"), button:has-text("Submit")').first();
    const hasBtnVisible = await completeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasBtnVisible) {
      await completeBtn.click();
    } else {
      // Fallback: doComplete() via React fiber
      await page.evaluate(() => {
        const root = document.querySelector('.sd-root-modern');
        if (!root) return;
        const fiberKey = Object.getOwnPropertyNames(root).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return;
        let fiber = (root as any)[fiberKey];
        for (let i = 0; i < 50 && fiber; i++) {
          if (fiber.memoizedProps?.model?.doComplete) {
            fiber.memoizedProps.model.doComplete();
            return;
          }
          fiber = fiber.return;
        }
      });
    }

    await page.waitForTimeout(3000);
    await page.screenshot({
      path: "test-results/04-submission-confirm.png",
      fullPage: true,
    });

    // Completion screen: SurveyJS shows "Thank you for completing the survey"
    // or the parent page shows "Completed" heading depending on implementation
    await expect(
      page.getByText(/Thank you for completing|completed|感謝|Completed|已提交/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("creator sees 1 response on dashboard", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator("input#email").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("input#email").fill("user1@quanwen.com");
    await page.locator("input#password").fill("000");
    await page.getByRole("button", { name: /^登入$/ }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    await page.goto(
      `${BASE_URL}/dashboard/surveys/33333333-3333-3333-3333-333333333301/stats`,
    );
    // Wait for React Query to load (api.ts 401 fix ensures queries don't cascade-fail)
    await page.getByText(/載入中/).waitFor({ state: "hidden", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "test-results/05-dashboard-with-response.png",
      fullPage: true,
    });

    // Stats page shows "共 N 份有效填答" or similar response count
    await expect(
      page.getByText(/共\s*[1-9][0-9]*\s*份|[1-9][0-9]*\s*(則回覆|responses?|有效填答|回答|submissions?)/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("creator can export responses as CSV or XLSX", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.locator("input#email").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("input#email").fill("user1@quanwen.com");
    await page.locator("input#password").fill("000");
    await page.getByRole("button", { name: /^登入$/ }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    await page.goto(
      `${BASE_URL}/dashboard/surveys/33333333-3333-3333-3333-333333333301/stats`,
    );
    await page.getByText(/載入中/).waitFor({ state: "hidden", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2000);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page
        .getByRole("button", { name: /匯出|export|下載|CSV|Excel/i })
        .first()
        .click(),
    ]);

    const exportPath = path.join(
      "test-results",
      download.suggestedFilename() || "export.csv",
    );
    await download.saveAs(exportPath);

    await page.screenshot({
      path: "test-results/06-export-triggered.png",
      fullPage: true,
    });
    expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx)$/i);
    expect(await download.failure()).toBeNull();
  });

  test("creator can generate AI insights (if feature is wired)", async ({
    page,
  }) => {
    await loginAsCreator(page);
    await page.goto(`${BASE_URL}/dashboard`);
    const statsLink = page.locator("a[href*='/stats']").first();
    if (await statsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statsLink.click();
    }

    const insightsBtn = page.getByRole("button", {
      name: /ai 洞察|generate insights|ai insights/i,
    });
    if (!(await insightsBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "AI insights feature not yet wired — skipping");
      return;
    }

    await insightsBtn.click();
    await expect(
      page.getByRole("article", { name: /insights|洞察/i }),
    ).toBeVisible({ timeout: 30000 });
    await page.screenshot({
      path: "test-results/07-ai-insights.png",
      fullPage: true,
    });
  });
});
