import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

const QUESTION_TYPES = ["single_choice", "multiple_choice", "text", "rating", "numeric", "yes_no", "dropdown"] as const;

function titleInput(page: import("@playwright/test").Page) {
  return page.locator("input[type='text']").first();
}

function addQuestionButton(page: import("@playwright/test").Page) {
  return page.locator("button.border-dashed").last();
}

test.describe("QUA-35 Survey Editor Phase 1", () => {
  test("AC1: surveyor can create a survey with all 7 question types", async ({ page }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");
    await titleInput(page).fill(`QUA-35 AC1 ${Date.now()}`);
    await page.getByPlaceholder("Question text").first().fill("Q1");

    for (let i = 0; i < QUESTION_TYPES.length; i++) {
      if (i > 0) await addQuestionButton(page).click();
      const typeSelect = page.getByLabel(`Question ${i + 1} type`);
      await expect(typeSelect).toBeVisible();
      await typeSelect.selectOption(QUESTION_TYPES[i]);
      await page.getByPlaceholder("Question text").nth(i).fill(`Q${i + 1}`);
      if (["single_choice", "multiple_choice", "dropdown"].includes(QUESTION_TYPES[i])) {
        const option1 = page.getByPlaceholder("Option 1").nth(i);
        const option2 = page.getByPlaceholder("Option 2").nth(i);
        if (await option1.isVisible()) await option1.fill("A");
        if (await option2.isVisible()) await option2.fill("B");
      }
    }

    for (let i = 0; i < QUESTION_TYPES.length; i++) {
      await expect(page.getByLabel(`Question ${i + 1} type`)).toHaveValue(QUESTION_TYPES[i]);
    }

    // AC1 validates capability to create and configure all 7 types on editor.
    // Persistence/navigation is covered by AC4 publish path.
  });

  test("AC2: live preview reflects title and question changes", async ({ page }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");
    const t = `Preview ${Date.now()}`;
    const q = `Question ${Date.now()}`;
    await titleInput(page).fill(t);
    await page.getByPlaceholder("Question text").first().fill(q);
    const previewSection = page.locator("section", { hasText: "Live Preview" });
    await expect(previewSection).toBeVisible();
    await expect(previewSection.getByText(t)).toBeVisible({ timeout: 7000 });
    await expect(previewSection.getByText(q)).toBeVisible({ timeout: 7000 });
  });

  test("AC3: logic jumps work in preview player", async ({ page }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");
    await titleInput(page).fill(`QUA-35 AC3 ${Date.now()}`);
    await page.getByPlaceholder("Question text").first().fill("Q1");
    await page.getByPlaceholder("Option 1").first().fill("go-next");
    await page.getByPlaceholder("Option 2").first().fill("go-end");
    await addQuestionButton(page).click();
    await expect(page.getByLabel("Question 2 type")).toBeVisible();
    await page.getByPlaceholder("Question text").nth(1).fill("Q2 should be skipped");
    const q1Card = page.locator("div.rounded-lg.border.border-border.bg-card").first();
    await q1Card.getByRole("button", { name: "Logic" }).click();
    await q1Card.getByRole("button", { name: "+ Add jump rule" }).click();
    const ruleBlock = q1Card.locator("div.rounded.border.border-border.p-2").first();
    await expect(ruleBlock).toBeVisible();
    await ruleBlock.locator("select").first().selectOption({ index: 1 });
    await ruleBlock.locator("select").nth(1).selectOption("__end__");
    const previewSection = page.locator("section", { hasText: "Live Preview" });
    await expect(previewSection).toBeVisible();
    await previewSection.locator("input[type='radio']").nth(1).check();
    await previewSection.getByRole("button", { name: /Next|Finish/i }).click();
    await expect(previewSection.getByText("Preview Complete")).toBeVisible();
  });

  test("AC4: survey can be published and opened from public link", async ({ page, context, request }) => {
    await login(page, "surveyor");
    await page.goto("/dashboard/surveys/new");
    await page.waitForLoadState("networkidle");

    const title = `QUA-35 AC4 ${Date.now()}`;
    await titleInput(page).fill(title);
    await page.getByPlaceholder("Question text").first().fill("Public Q1");
    await page.getByPlaceholder("Option 1").first().fill("Yes");
    await page.getByPlaceholder("Option 2").first().fill("No");

    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page).not.toHaveURL(/\/dashboard\/surveys\/new$/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[0-9a-f-]{36}$/, { timeout: 15000 });

    const surveyId = page.url().split("/").pop();
    expect(surveyId).toBeTruthy();
    await expect(page.getByText("Loading survey")).not.toBeVisible({ timeout: 10000 });

    const publishBtn = page.getByRole("button", { name: "Publish" });
    await expect(publishBtn).toBeVisible({ timeout: 10000 });
    await publishBtn.click();
    await expect(page.getByText(/Pending Review|Published|pending_review/i)).toBeVisible({ timeout: 10000 });

    const adminLogin = await request.post("http://localhost:3001/api/v1/auth/login", {
      data: { email: "user@quanwen.com", password: "000" },
    });
    console.log("adminLogin status:", adminLogin.status(), "ok:", adminLogin.ok());
    expect(adminLogin.ok()).toBeTruthy();
    const adminLoginBody = await adminLogin.json() as { token: string };
    const { token } = adminLoginBody;
    console.log("admin token length:", token?.length);

    const approveResp = await request.post(`http://localhost:3001/api/v1/admin/surveys/${surveyId}/approve`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("approve status:", approveResp.status(), "ok:", approveResp.ok());
    console.log("approve body:", await approveResp.text());

    // Verify survey status via API
    const surveyCheck = await request.get(`http://localhost:3001/api/v1/surveys/${surveyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const surveyData = await surveyCheck.json() as { status: string };
    console.log("survey status after approve:", surveyData.status);

    // Verify public API
    const publicCheck = await request.get(`http://localhost:3001/api/v1/public/tasks/${surveyId}`);
    console.log("public check status:", publicCheck.status(), "body:", await publicCheck.text());

    const anon = await context.browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`http://localhost:3000/s/${surveyId}`);
    await anonPage.waitForLoadState("networkidle");
    // Debug: dump page content
    console.log("anon page text (first 500):", await anonPage.locator("body").innerText({ timeout: 5000 }).catch(() => "TIMEOUT"));
    await expect(anonPage.getByRole("heading", { name: title })).toBeVisible({ timeout: 10000 });
    await expect(anonPage.locator("input[type='radio']").first()).toBeVisible({ timeout: 10000 });
    await anon.close();
  });
});
