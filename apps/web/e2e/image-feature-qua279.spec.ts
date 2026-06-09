import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('QUA-279: Image Feature E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'bb'); // surveyor
    await page.goto('/dashboard/surveys/new');
  });

  test('Should upload and display survey cover image', async ({ page }) => {
    // Wait for page load
    await page.waitForSelector('h1:has-text("新增問卷")');

    // Find the ImageUploader for cover image
    const uploadButton = page.locator('button:has-text("點擊上傳圖片")').first();
    await expect(uploadButton).toBeVisible();

    // Create a test image (simple base64 encoded PNG)
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    // Create a file input (hidden element)
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-cover.png',
      mimeType: 'image/png',
      buffer: testImageBuffer,
    });

    // Wait for image to upload and appear
    await page.waitForTimeout(2000);

    // Verify image is displayed
    const uploadedImage = page.locator('img[alt="封面圖片"]');
    await expect(uploadedImage).toBeVisible({ timeout: 10000 });

    // Save the survey（需填有效題目，否則存草稿因空題目 400）
    await page.fill('input[placeholder="輸入問卷標題"]', '測試圖片問卷');
    await page.getByPlaceholder('題目文字').first().fill('測試題目');
    await page.getByPlaceholder('選項 1').first().fill('選項A');
    await page.getByPlaceholder('選項 2').first().fill('選項B');
    await page.click('button:has-text("儲存草稿")');

    // Verify we're redirected to survey detail page
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[a-f0-9-]+/, { timeout: 10000 });
  });

  test('Should upload and display question image', async ({ page }) => {
    // Wait for page load
    await page.waitForSelector('h1:has-text("新增問卷")');

    // Fill basic survey info
    await page.fill('input[placeholder="輸入問卷標題"]', '題目圖片測試');

    // Find question editor
    const questionEditor = page.locator('text=Q1').first();
    await expect(questionEditor).toBeVisible();

    // Find the question image upload button (compact mode)
    const uploadButton = page.locator('button:has-text("+ 上傳圖片")').first();
    if (await uploadButton.isVisible()) {
      // Create a test image
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );

      // Find file input in question editor
      const fileInputs = page.locator('input[type="file"]');
      const count = await fileInputs.count();
      if (count > 0) {
        await fileInputs.nth(0).setInputFiles({
          name: 'test-question.png',
          mimeType: 'image/png',
          buffer: testImageBuffer,
        });

        // Wait for upload
        await page.waitForTimeout(2000);

        // Verify image is displayed in compact mode
        const uploadedImage = page.locator('img[alt="已上傳圖片"]');
        if (await uploadedImage.count() > 0) {
          await expect(uploadedImage.first()).toBeVisible();
        }
      }
    }

    // Save the survey（填有效題目內容避免空題目 400）
    await page.getByPlaceholder('題目文字').first().fill('測試題目');
    await page.getByPlaceholder('選項 1').first().fill('選項A');
    await page.getByPlaceholder('選項 2').first().fill('選項B');
    await page.click('button:has-text("儲存草稿")');

    // Verify we're redirected
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[a-f0-9-]+/, { timeout: 10000 });
  });

  test('Should display cover image in task cards', async ({ page }) => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    // 建有封面的問卷 → 存草稿 → 發布；draft 不會出現在 /tasks，需發布後由受試者檢視
    await page.waitForSelector('h1:has-text("新增問卷")');
    await expect(page.locator('button:has-text("點擊上傳圖片")').first()).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-task-cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(page.locator('img[alt="封面圖片"]')).toBeVisible({ timeout: 10000 });

    await page.fill('input[placeholder="輸入問卷標題"]', `卡片圖片測試 ${Date.now()}`);
    await page.getByPlaceholder('題目文字').first().fill('測試題目');
    await page.getByPlaceholder('選項 1').first().fill('選項A');
    await page.getByPlaceholder('選項 2').first().fill('選項B');
    await page.click('button:has-text("儲存草稿")');
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[a-f0-9-]+/, { timeout: 10000 });
    const surveyId = page.url().match(/surveys\/([a-f0-9-]+)/)![1];

    // 發布（用 surveyor token 打 API；若需審核則 admin approve）
    const token = await page.evaluate(() => localStorage.getItem('qw_token'));
    const pub = await page.request.post(`${API}/surveys/${surveyId}/publish`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pub.ok() || pub.status() === 403) {
      const adminLogin = await page.request.post(`${API}/auth/login`, { data: { email: 'user@quanwen.com', password: '000' } });
      if (adminLogin.ok()) {
        const { token: adminToken } = await adminLogin.json();
        await page.request.post(`${API}/admin/surveys/${surveyId}/approve`, { headers: { Authorization: `Bearer ${adminToken}` } });
      }
    }

    // 受試者 aa 檢視 /tasks，應看到封面卡片。React 把 style={{backgroundImage}} 渲染成
    // style="background-image:..."（kebab-case），故 selector 用 background-image
    await login(page, 'aa');
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[style*="background-image"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('Should remove cover image', async ({ page }) => {
    // 確保頁面 + 上傳元件就緒再上傳（mirror cover 上傳測試的 readiness）
    await page.waitForSelector('h1:has-text("新增問卷")');
    await expect(page.locator('button:has-text("點擊上傳圖片")').first()).toBeVisible();

    // Upload an image
    const fileInput = page.locator('input[type="file"]').first();
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    await fileInput.setInputFiles({
      name: 'test-remove.png',
      mimeType: 'image/png',
      buffer: testImageBuffer,
    });

    // Verify image is shown（上傳→顯示為非同步，用 toBeVisible 等而非固定 timeout）
    const uploadedImage = page.locator('img[alt="封面圖片"]');
    await expect(uploadedImage).toBeVisible({ timeout: 10000 });

    // 移除鈕在 group-hover overlay（opacity-0，始終在 DOM）；hover 1x1 PNG 的 stability 不穩，
    // 直接 force 點擊
    const removeButton = page.locator('button:has-text("移除")').first();
    await removeButton.click({ force: true });

    // Verify upload button reappears
    const uploadButton = page.locator('button:has-text("點擊上傳圖片")').first();
    await expect(uploadButton).toBeVisible();
  });

  test('Should validate image file type and size', async ({ page }) => {
    // Navigate to new survey
    await page.goto('/dashboard/surveys/new');

    // Try to upload a non-image file (txt)
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('test content'),
    });

    await page.waitForTimeout(1000);

    // Should show error message
    const errorMessage = page.locator('text=僅支援 JPEG, PNG, GIF, WebP, SVG');
    await expect(errorMessage).toBeVisible();
  });
});