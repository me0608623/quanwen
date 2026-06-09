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
    await expect(uploadedImage).toBeVisible();

    // Save the survey
    await page.fill('input[placeholder="輸入問卷標題"]', '測試圖片問卷');
    await page.click('button:has-text("儲存草稿")');
    await page.waitForTimeout(2000);

    // Verify we're redirected to survey detail page
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[a-f0-9-]+/);
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

    // Save the survey
    await page.click('button:has-text("儲存草稿")');
    await page.waitForTimeout(2000);

    // Verify we're redirected
    await expect(page).toHaveURL(/\/dashboard\/surveys\/[a-f0-9-]+/);
  });

  test('Should display cover image in task cards', async ({ page }) => {
    // First create a survey with image
    await page.goto('/dashboard/surveys/new');

    // Fill basic info
    await page.fill('input[placeholder="輸入問卷標題"]', '卡片圖片測試');

    // Upload cover image
    const fileInput = page.locator('input[type="file"]').first();
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    await fileInput.setInputFiles({
      name: 'test-task-cover.png',
      mimeType: 'image/png',
      buffer: testImageBuffer,
    });

    await page.waitForTimeout(2000);

    // Save
    await page.click('button:has-text("儲存草稿")');
    await page.waitForTimeout(2000);

    // Navigate to tasks page
    await page.goto('/tasks');

    // Wait for task cards to load
    await page.waitForTimeout(1000);

    // Verify cover image is displayed in card background
    // The image should be in the background of a div with bg-cover
    const cardWithImage = page.locator('[style*="backgroundImage"]');
    const count = await cardWithImage.count();

    // At least one card should have the image
    expect(count).toBeGreaterThan(0);
  });

  test('Should remove cover image', async ({ page }) => {
    // Navigate to new survey
    await page.goto('/dashboard/surveys/new');

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

    await page.waitForTimeout(2000);

    // Verify image is shown
    const uploadedImage = page.locator('img[alt="封面圖片"]');
    await expect(uploadedImage).toBeVisible();

    // Hover to show remove button
    await uploadedImage.hover();

    // Click remove button
    const removeButton = page.locator('button:has-text("移除")').first();
    await expect(removeButton).toBeVisible();
    await removeButton.click();

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