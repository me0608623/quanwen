import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

const QUESTION_TYPES = ["single_choice", "multiple_choice", "text", "rating", "numeric", "yes_no", "dropdown"] as const;

function titleInput(page: import("@playwright/test").Page) {
  return page.locator("input[type='text']").first();
}

function addQuestionButton(page: import("@playwright/test").Page) {
  return page.locator("button.border-dashed").last();
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

test.describe("QUA-35 Survey Editor Phase 1", () => {
  test("AC1: surveyor can create a survey with all 7 question types", async ({ page }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");
    await titleInput(page).fill(`QUA-35 AC1 ${Date.now()}`);
    await page.getByPlaceholder("題目文字").first().fill("Q1");

    for (let i = 0; i < QUESTION_TYPES.length; i++) {
      if (i > 0) await addQuestionButton(page).click();
      const typeSelect = page.getByLabel(`第 ${i + 1} 題類型`);
      await expect(typeSelect).toBeVisible();
      await typeSelect.selectOption(QUESTION_TYPES[i]);
      await page.getByPlaceholder("題目文字").nth(i).fill(`Q${i + 1}`);
      if (["single_choice", "multiple_choice", "dropdown"].includes(QUESTION_TYPES[i])) {
        const option1 = page.getByPlaceholder("選項 1").nth(i);
        const option2 = page.getByPlaceholder("選項 2").nth(i);
        if (await option1.isVisible()) await option1.fill("A");
        if (await option2.isVisible()) await option2.fill("B");
      }
    }

    for (let i = 0; i < QUESTION_TYPES.length; i++) {
      await expect(page.getByLabel(`第 ${i + 1} 題類型`)).toHaveValue(QUESTION_TYPES[i]);
    }

    await page.getByRole("button", { name: /儲存草稿/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[^/]+$/, { timeout: 15000 });
  });

  test("AC2: live preview reflects title and question changes", async ({ page }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");
    const t = `Preview ${Date.now()}`;
    const q = `Question ${Date.now()}`;
    await titleInput(page).fill(t);
    await page.getByPlaceholder("題目文字").first().fill(q);
    const previewSection = page.locator("section", { hasText: "即時預覽" });
    await expect(previewSection).toBeVisible();
    await expect(previewSection.getByText(t)).toBeVisible({ timeout: 7000 });
    await expect(previewSection.getByText(q)).toBeVisible({ timeout: 7000 });
  });

  test("AC3: logic jumps work in preview player", async ({ page }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");
    await titleInput(page).fill(`QUA-35 AC3 ${Date.now()}`);
    await page.getByPlaceholder("題目文字").first().fill("Q1");
    await page.getByPlaceholder("選項 1").first().fill("go-next");
    await page.getByPlaceholder("選項 2").first().fill("go-end");
    await addQuestionButton(page).click();
    await expect(page.getByLabel("第 2 題類型")).toBeVisible();
    await page.getByPlaceholder("題目文字").nth(1).fill("Q2 should be skipped");
    const q1Card = page.locator("div.rounded-lg.border.border-border.bg-card").first();
    await q1Card.getByRole("button", { name: "邏輯" }).click();
    await q1Card.getByRole("button", { name: "+ 新增跳題規則" }).click();
    const ruleBlock = q1Card.locator("div.rounded.border.border-border.p-2").first();
    await expect(ruleBlock).toBeVisible();
    await ruleBlock.locator("select").first().selectOption({ index: 1 });
    await ruleBlock.locator("select").nth(1).selectOption("__end__");
    const previewSection = page.locator("section", { hasText: "即時預覽" });
    await expect(previewSection).toBeVisible();
    await previewSection.locator("input[type='radio']").nth(1).check();
    await previewSection.getByRole("button", { name: /下一步|完成/ }).click();
    await expect(previewSection.getByText("預覽完成")).toBeVisible();
  });

  test("AC4: survey can be published and opened from public link", async ({ page, request }) => {
    const title = `QUA-35 AC4 ${Date.now()}`;

    // ?? Step 1: Create survey via API (bypasses UI Save Draft flakiness) ??
    const surveyorLogin = await request.post(`${API}/auth/login`, {
      data: { email: "user1@quanwen.com", password: "000" },
    });
    expect(surveyorLogin.ok()).toBeTruthy();
    const { token: surveyorToken } = await surveyorLogin.json();

    const createResp = await request.post(`${API}/surveys`, {
      headers: { Authorization: `Bearer ${surveyorToken}` },
      data: {
        title,
        description: "AC4 public link test",
        rewardPoints: 10,
        targetCount: 100,
        isAnonymous: true,
        questions: [
          {
            type: "single_choice",
            title: "Public Q1",
            isRequired: true,
            sortOrder: 1,
            options: [
              { label: "Yes", sortOrder: 1 },
              { label: "No", sortOrder: 2 },
            ],
          },
        ],
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const survey = await createResp.json();
    const surveyId = survey.id;
    console.log("AC4: created survey", surveyId);

    // ?? Step 2: Publish via API ??
    const publishResp = await request.post(`${API}/surveys/${surveyId}/publish`, {
      headers: { Authorization: `Bearer ${surveyorToken}` },
    });
    expect(publishResp.ok()).toBeTruthy();
    console.log("AC4: published");

    // Step 3: Ensure public endpoint is open (approval may or may not be required)
    let publicApiResp = await request.get(`${API}/public/tasks/${surveyId}`);
    if (!publicApiResp.ok()) {
      let adminToken: string | null = null;
      for (let i = 0; i < 3; i++) {
        const adminLogin = await request.post(`${API}/auth/login`, {
          data: { email: "user@quanwen.com", password: "000" },
        });
        if (adminLogin.ok()) {
          const adminData = await adminLogin.json();
          adminToken = adminData.token as string;
          break;
        }
        await page.waitForTimeout(500 * (i + 1));
      }
      expect(adminToken).toBeTruthy();

      const approveResp = await request.post(`${API}/admin/surveys/${surveyId}/approve`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      console.log("AC4: approve status", approveResp.status());
    }

    publicApiResp = await request.get(`${API}/public/tasks/${surveyId}`);
    console.log("AC4: public API status", publicApiResp.status());
    expect(publicApiResp.ok()).toBeTruthy();
    const publicData = await publicApiResp.json();
    expect(publicData.title).toBe(title);

    // ?? Step 5: Verify the survey editor page loads (sanity check) ??
    await login(page, "surveyor");
    await page.goto(`/dashboard/surveys/${surveyId}`);
    // Wait for the editor shell to load (not stuck on "Loading survey...")
    await expect(page.getByText("Loading survey")).not.toBeVisible({ timeout: 10_000 });
    // Verify the title textbox contains the survey title（/[id] 編輯器 title input 用 placeholder="未命名問卷"）
    await expect(page.locator('input[placeholder="未命名問卷"]').first()).toHaveValue(title, { timeout: 5_000 });

    // ?? Step 6: Open public link as anonymous user ??
    const anonContext = await page.context().browser()!.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${surveyId}`);
    await anonPage.waitForLoadState("networkidle");

    // Debug: dump page content
    console.log("AC4: anon page text (first 500):", await anonPage.locator("body").innerText({ timeout: 5_000 }).catch(() => "TIMEOUT"));

    await expect(anonPage.getByRole("heading", { name: title })).toBeVisible({ timeout: 10_000 });
    await expect(anonPage.locator("main")).toContainText("Public Q1", { timeout: 10_000 });
    await anonContext.close();
  });
});

