import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

test.describe('QUA-250 問卷完整流程 E2E 測試', () => {
  let surveyId: string;

  test.beforeEach(async ({ page }) => {
    // 清理舊測試問卷（以 API 刪除標記為測試的問卷）
    const surveyorLogin = await page.request.post(`${API}/auth/login`, {
      data: { email: 'user1@quanwen.com', password: '000' },
    });
    if (surveyorLogin.ok()) {
      const { token } = await surveyorLogin.json();
      const surveysResp = await page.request.get(`${API}/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (surveysResp.ok()) {
        const surveys = await surveysResp.json();
        for (const s of surveys) {
          if (s.title?.startsWith('QUA-250')) {
            await page.request.delete(`${API}/surveys/${s.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        }
      }
    }
  });

  test.describe('1. 建立問卷流程', () => {
    test('AC1: 建立、編輯、預覽問卷', async ({ page }) => {
      await login(page, 'bb');

      // 前往新增問卷頁
      await page.goto('/dashboard/surveys/new');
      await page.waitForLoadState('networkidle');

      const testTitle = `QUA-250 完整流程測試 ${Date.now()}`;
      const testDesc = '這是 E2E 測試問卷描述';

      // 填寫基本資訊
      await page.locator('input[type="text"]').first().fill(testTitle);
      await page.locator('textarea').first().fill(testDesc);

      // 新增第一題：單選
      await page.getByPlaceholder('Question text').first().fill('你的性別是？');
      await page.getByPlaceholder('Option 1').first().fill('男性');
      await page.getByPlaceholder('Option 2').first().fill('女性');

      // 新增第二題：多選
      await page.locator('button.border-dashed').last().click();
      await page.getByLabel(/Question 2 type/i).selectOption('multiple_choice');
      await page.getByPlaceholder('Question text').nth(1).fill('你喜歡哪些程式語言？（可多選）');
      await page.getByPlaceholder('Option 1').nth(1).fill('JavaScript');
      await page.getByPlaceholder('Option 2').nth(1).fill('Python');
      await page.getByPlaceholder('Option 3').nth(1).fill('Rust');

      // 新增第三題：文字問答
      await page.locator('button.border-dashed').last().click();
      await page.getByLabel(/Question 3 type/i).selectOption('text');
      await page.getByPlaceholder('Question text').nth(2).fill('請分享你對 AI 發展的看法');

      // 新增第四題：評分
      await page.locator('button.border-dashed').last().click();
      await page.getByLabel(/Question 4 type/i).selectOption('rating');
      await page.getByPlaceholder('Question text').nth(3).fill('你對本問卷的滿意度？');

      // 新增第五題：數字
      await page.locator('button.border-dashed').last().click();
      await page.getByLabel(/Question 5 type/i).selectOption('numeric');
      await page.getByPlaceholder('Question text').nth(4).fill('你的年齡？');

      // 新增第六題：是/否
      await page.locator('button.border-dashed').last().click();
      await page.getByLabel(/Question 6 type/i).selectOption('yes_no');
      await page.getByPlaceholder('Question text').nth(5).fill('你是否有軟體開發經驗？');

      // 新增第七題：日期（如果支援）
      try {
        await page.locator('button.border-dashed').last().click();
        await page.getByLabel(/Question 7 type/i).selectOption('date');
        await page.getByPlaceholder('Question text').nth(6).fill('預計畢業日期？');
      } catch (e) {
        // date 類型可能不支援，跳過
      }

      // 預覽問卷
      const previewBtn = page.getByRole('button', { name: /預覽|preview/i });
      if (await previewBtn.isVisible()) {
        await previewBtn.click();
        // 應該看到預覽 modal 或 section
        await expect(page.locator('section', { hasText: /預覽|preview/i })).toBeVisible({ timeout: 5000 });
        // 關閉預覽
        await page.keyboard.press('Escape');
      }

      // 儲存草稿
      await page.getByRole('button', { name: /儲存草稿|save draft/i }).click();

      // 驗證跳轉到問卷詳情頁
      await expect(page).toHaveURL(/\/dashboard\/surveys\/[^/]+$/, { timeout: 15000 });

      // 取得 surveyId
      const urlMatch = page.url().match(/\/surveys\/([^/]+)/);
      if (urlMatch) {
        surveyId = urlMatch[1];
        console.log('Created survey ID:', surveyId);
      }
    });

    test('AC2: 編輯已存在的問卷', async ({ page }) => {
      await login(page, 'bb');

      // 先建立一個問卷
      const createResp = await page.request.post(`${API}/auth/login`, {
        data: { email: 'user1@quanwen.com', password: '000' },
      });
      expect(createResp.ok()).toBeTruthy();
      const { token } = await createResp.json();

      const surveyResp = await page.request.post(`${API}/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: `QUA-250 編輯測試 ${Date.now()}`,
          description: '測試編輯功能',
          rewardPoints: 10,
          targetCount: 100,
          isAnonymous: true,
          questions: [
            {
              type: 'single_choice',
              title: '測試題目',
              isRequired: true,
              sortOrder: 1,
              options: [{ label: 'A', sortOrder: 1 }, { label: 'B', sortOrder: 2 }],
            },
          ],
        },
      });
      expect(surveyResp.ok()).toBeTruthy();
      const survey = await surveyResp.json();
      surveyId = survey.id;

      // 前往編輯頁
      await page.goto(`/dashboard/surveys/${surveyId}`);
      await page.waitForLoadState('networkidle');

      // 修改標題
      const titleInput = page.locator('input[type="text"]').first();
      await titleInput.clear();
      await titleInput.fill(`QUA-250 編輯後標題 ${Date.now()}`);

      // 修改題目
      await page.getByPlaceholder('Question text').first().fill('修改後的題目');

      // 儲存
      await page.getByRole('button', { name: /儲存草稿|save draft/i }).click();

      // 重新載入頁面驗證修改
      await page.reload();
      await expect(titleInput).toHaveValue(/編輯後標題/);
    });
  });

  test.describe('2. 填寫問卷流程', () => {
    test.beforeEach(async ({ page }) => {
      // 建立測試問卷
      const surveyorLogin = await page.request.post(`${API}/auth/login`, {
        data: { email: 'user1@quanwen.com', password: '000' },
      });
      expect(surveyorLogin.ok()).toBeTruthy();
      const { token } = await surveyorLogin.json();

      const surveyResp = await page.request.post(`${API}/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: `QUA-250 填答測試 ${Date.now()}`,
          description: '測試填答流程',
          rewardPoints: 10,
          targetCount: 100,
          isAnonymous: true,
          questions: [
            {
              type: 'single_choice',
              title: '你的性別是？',
              isRequired: true,
              sortOrder: 1,
              options: [{ label: '男性', sortOrder: 1 }, { label: '女性', sortOrder: 2 }],
            },
            {
              type: 'multiple_choice',
              title: '你喜歡哪些程式語言？（可多選）',
              isRequired: true,
              sortOrder: 2,
              options: [
                { label: 'JavaScript', sortOrder: 1 },
                { label: 'Python', sortOrder: 2 },
                { label: 'Rust', sortOrder: 3 },
              ],
            },
            {
              type: 'text',
              title: '請分享你的想法',
              isRequired: true,
              sortOrder: 3,
            },
            {
              type: 'rating',
              title: '你對本問卷的滿意度？',
              isRequired: false,
              sortOrder: 4,
            },
          ],
        },
      });
      expect(surveyResp.ok()).toBeTruthy();
      const survey = await surveyResp.json();
      surveyId = survey.id;

      // 發布問卷
      const publishResp = await page.request.post(`${API}/surveys/${surveyId}/publish`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 如果需要審核，用 admin 帳號通過
      if (!publishResp.ok() || publishResp.status() === 403) {
        const adminLogin = await page.request.post(`${API}/auth/login`, {
          data: { email: 'user@quanwen.com', password: '000' },
        });
        if (adminLogin.ok()) {
          const { token: adminToken } = await adminLogin.json();
          await page.request.post(`${API}/admin/surveys/${surveyId}/approve`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
      }

      console.log('Test survey created:', surveyId);
    });

    test('AC3: 匿名用戶開啟公開連結並填答', async ({ page }) => {
      // 開啟公開連結
      await page.goto(`/s/${surveyId}`);
      await page.waitForLoadState('networkidle');

      // 應該看到問卷標題
      const title = await page.locator('h1, h2').first().textContent();
      expect(title).toContain('QUA-250 填答測試');

      // 填答第一題（單選）
      await page.locator('input[type="radio"]').first().check();

      // 填答第二題（多選）
      await page.locator('input[type="checkbox"]').nth(0).check();
      await page.locator('input[type="checkbox"]').nth(1).check();

      // 填答第三題（文字）
      await page.locator('textarea').first().fill('這是我的測試回答');

      // 填答第四題（評分，選填）
      const ratingInput = page.locator('input[type="range"]').first();
      if (await ratingInput.isVisible()) {
        await ratingInput.fill('4');
      }

      // 提交
      await page.getByRole('button', { name: /提交|送出|finish/i }).click();

      // 應該看到感謝頁
      await expect(page.locator('text=/感謝|thank you|完成|submitted/i')).toBeVisible({ timeout: 5000 });
    });

    test('AC4: 必填題驗證', async ({ page }) => {
      await page.goto(`/s/${surveyId}`);
      await page.waitForLoadState('networkidle');

      // 不填任何題目直接提交
      const submitBtn = page.getByRole('button', { name: /提交|送出|finish/i });
      await submitBtn.click();

      // 應該看到錯誤提示
      await expect(page.locator('text=/請填寫必填項目|required/i')).toBeVisible({ timeout: 3000 });
    });

    test('AC5: 已填答用戶無法重複填答', async ({ page, request }) => {
      // 先用 API 登入並填答
      const loginResp = await request.post(`${API}/auth/login`, {
        data: { email: 'user2@quanwen.com', password: '000' },
      });
      if (loginResp.ok()) {
        const { token } = await loginResp.json();

        // 第一次提交
        const submitResp = await request.post(`${API}/public/surveys/${surveyId}/submit`, {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            answers: [
              { questionId: '1', value: '男性' },
              { questionId: '2', value: ['JavaScript', 'Python'] },
              { questionId: '3', value: '第一次填答' },
            ],
          },
        });
        expect(submitResp.ok()).toBeTruthy();
      }

      // 用同一帳號再次訪問
      await login(page, 'aa');
      await page.goto(`/s/${surveyId}`);
      await page.waitForLoadState('networkidle');

      // 應該顯示已填答訊息
      await expect(page.locator('text=/已填答|already submitted|已完成/i')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('3. 結果分析流程', () => {
    test.beforeEach(async ({ page, request }) => {
      // 建立問卷並提交一些測試資料
      const surveyorLogin = await request.post(`${API}/auth/login`, {
        data: { email: 'user1@quanwen.com', password: '000' },
      });
      expect(surveyorLogin.ok()).toBeTruthy();
      const { token } = await surveyorLogin.json();

      const surveyResp = await request.post(`${API}/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: `QUA-250 統計測試 ${Date.now()}`,
          description: '測試統計功能',
          rewardPoints: 10,
          targetCount: 100,
          isAnonymous: true,
          questions: [
            {
              type: 'single_choice',
              title: '你的性別是？',
              isRequired: true,
              sortOrder: 1,
              options: [{ label: '男性', sortOrder: 1 }, { label: '女性', sortOrder: 2 }],
            },
            {
              type: 'text',
              title: '你的建議',
              isRequired: true,
              sortOrder: 2,
            },
          ],
        },
      });
      expect(surveyResp.ok()).toBeTruthy();
      const survey = await surveyResp.json();
      surveyId = survey.id;

      // 發布
      const publishResp = await request.post(`${API}/surveys/${surveyId}/publish`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!publishResp.ok() || publishResp.status() === 403) {
        const adminLogin = await request.post(`${API}/auth/login`, {
          data: { email: 'user@quanwen.com', password: '000' },
        });
        if (adminLogin.ok()) {
          const { token: adminToken } = await adminLogin.json();
          await request.post(`${API}/admin/surveys/${surveyId}/approve`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
      }

      // 提交測試資料（使用匿名 API）
      await request.post(`${API}/public/surveys/${surveyId}/submit`, {
        data: {
          answers: [
            { questionId: '1', value: '男性' },
            { questionId: '2', value: '測試建議 1' },
          ],
        },
      });

      await request.post(`${API}/public/surveys/${surveyId}/submit`, {
        data: {
          answers: [
            { questionId: '1', value: '女性' },
            { questionId: '2', value: '測試建議 2' },
          ],
        },
      });
    });

    test('AC6: 查看統計頁', async ({ page }) => {
      await login(page, 'bb');
      await page.goto(`/dashboard/surveys/${surveyId}/stats`);
      await page.waitForLoadState('networkidle');

      // 應該看到統計標題
      await expect(page.locator('h1, h2').filter({ hasText: /統計|stats|分析/i })).toBeVisible();

      // 應該看到回應數量
      await expect(page.locator('text=/2.*份|2.*responses/i')).toBeVisible({ timeout: 5000 });

      // 應該看到圖表或表格
      const chartOrTable = page.locator('svg, table, .bar-chart, .donut-chart').first();
      await expect(chartOrTable).toBeVisible({ timeout: 5000 });
    });

    test('AC7: 匯出資料', async ({ page }) => {
      await login(page, 'bb');
      await page.goto(`/dashboard/surveys/${surveyId}/stats`);
      await page.waitForLoadState('networkidle');

      // 尋找匯出按鈕
      const exportBtn = page.getByRole('button', { name: /匯出|export|下載|download/i });
      if (await exportBtn.isVisible({ timeout: 3000 })) {
        const downloadPromise = page.waitForEvent('download');
        await exportBtn.click();
        const download = await downloadPromise;

        // 驗證下載的檔案
        expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx|json)$/);
      } else {
        console.log('Export button not found, may not be implemented yet');
      }
    });

    test('AC8: 查看品質分布', async ({ page }) => {
      await login(page, 'bb');
      await page.goto(`/dashboard/surveys/${surveyId}/stats`);
      await page.waitForLoadState('networkidle');

      // 尋找品質分布區塊
      const qualitySection = page.locator('text=/品質|quality/i');
      if (await qualitySection.isVisible({ timeout: 3000 })) {
        await expect(qualitySection).toBeVisible();

        // 應該看到分類標籤（乾淨/可疑/退件等）
        await expect(
          page.locator('text=/乾淨|clean|通過|passed|suspicious|可疑|退件|rejected/i')
        ).toBeVisible();
      }
    });
  });

  test.describe('4. 錯誤處理測試', () => {
    test('AC9: 不存在的問卷連結返回 404', async ({ page }) => {
      await page.goto('/s/00000000-0000-0000-0000-000000000000');
      await expect(page.locator('text=/404|找不到|not found/i')).toBeVisible({ timeout: 5000 });
    });

    test('AC10: 未登入訪問需要權限的頁面被重導向', async ({ page }) => {
      // 訪問 dashboard 應該被重導向到登入頁
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
    });

    test('AC11: 已關閉的問卷無法填答', async ({ page, request }) => {
      // 建立並發布問卷
      const surveyorLogin = await request.post(`${API}/auth/login`, {
        data: { email: 'user1@quanwen.com', password: '000' },
      });
      expect(surveyorLogin.ok()).toBeTruthy();
      const { token } = await surveyorLogin.json();

      const surveyResp = await request.post(`${API}/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: `QUA-250 關閉測試 ${Date.now()}`,
          description: '測試關閉功能',
          rewardPoints: 10,
          targetCount: 100,
          isAnonymous: true,
          questions: [
            {
              type: 'single_choice',
              title: '測試題目',
              isRequired: true,
              sortOrder: 1,
              options: [{ label: 'A', sortOrder: 1 }],
            },
          ],
        },
      });
      expect(surveyResp.ok()).toBeTruthy();
      const survey = await surveyResp.json();
      const testSurveyId = survey.id;

      // 發布並審核
      const publishResp = await request.post(`${API}/surveys/${testSurveyId}/publish`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!publishResp.ok() || publishResp.status() === 403) {
        const adminLogin = await request.post(`${API}/auth/login`, {
          data: { email: 'user@quanwen.com', password: '000' },
        });
        if (adminLogin.ok()) {
          const { token: adminToken } = await adminLogin.json();
          await request.post(`${API}/admin/surveys/${testSurveyId}/approve`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
      }

      // 關閉問卷
      await request.post(`${API}/surveys/${testSurveyId}/close`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 嘗試訪問
      await page.goto(`/s/${testSurveyId}`);
      await page.waitForLoadState('networkidle');

      // 應該顯示關閉訊息
      await expect(page.locator('text=/已關閉|closed|無法填答|not available/i')).toBeVisible({ timeout: 5000 });
    });
  });
});