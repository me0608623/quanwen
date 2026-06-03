# QUA-279 圖片功能 - QA 驗證報告

## 任務描述
新增問卷那邊要讓問卷建立者可以新增圖片 每一題目也可以新增題目 或是問卷顯示的卡片也可以用圖片當背景

## 實作範圍
1. 問卷封面圖片 (問卷建立者可新增)
2. 問題圖片 (每一題目可以新增)
3. 問卷卡片背景圖片 (任務列表顯示)

## 實作狀態驗證

### ✅ 1. 問卷封面圖片

#### 前端實作
**檔案位置**: `apps/web/src/app/dashboard/surveys/new/page.tsx` (第 229-234 行)
- 使用 `ImageUploader` 組件
- 狀態管理: `coverImageUrl` state
- 儲存時包含 `coverImageUrl` 到 API payload

#### 後端實作
**檔案位置**: `apps/api/src/db/schema/surveys.ts` (第 114 行)
- 欄位: `coverImageUrl: text('cover_image_url')`

**檔案位置**: `apps/api/src/surveys/dto/create-survey.dto.ts` (第 76 行)
- DTO 驗證: `coverImageUrl: z.string().max(500).optional()`

**檔案位置**: `apps/api/src/surveys/surveys.service.ts` (第 99 行)
- 建立問卷時處理 `coverImageUrl`

### ✅ 2. 問題圖片

#### 前端實作
**檔案位置**: `apps/web/src/components/survey-editor/question-editor.tsx` (第 244-250 行)
- 使用 `ImageUploader` 組件 (compact 模式)
- 透過 `updateField('imageUrl', url)` 更新問題資料

**檔案位置**: `apps/web/src/hooks/use-surveys.ts` (第 98 行)
- Type 定義: `SurveyQuestion` 包含 `imageUrl?: string`

#### 後端實作
**檔案位置**: `apps/api/src/db/schema/surveys.ts` (第 156 行)
- 欄位: `imageUrl: text('image_url')`

**檔案位置**: `apps/api/src/surveys/dto/create-survey.dto.ts` (第 17 行)
- DTO 驗證: `imageUrl: z.string().max(500).nullish()`

### ✅ 3. 問卷卡片背景圖片顯示

#### 前端實作
**檔案位置**: `apps/web/src/app/tasks/page.tsx` (第 173-191 行)
- 條件渲染: `s.coverImageUrl ? (...) : null`
- 使用 `style={{ backgroundImage: ... }}` 設定背景
- 圖片上方漸層遮罩確保文字可讀性

### ✅ 4. 圖片上傳 API

**檔案位置**: `apps/api/src/common/upload/upload.controller.ts`
- 端點: `POST /upload/image`
- 權限: 需要 JWT 認證 (`@UseGuards(JwtAuthGuard)`)
- 限制: 最大 5MB，支援 JPEG, PNG, GIF, WebP, SVG
- 回傳格式: `{ success: true, data: { url } }`

### ✅ 5. 問卷填答頁面顯示問題圖片

**檔案位置**: `apps/web/src/lib/surveyjs-adapter.ts` (第 156-158 行)
- 轉換邏輯: `imageLink: resolveAssetUrl(q.imageUrl) || undefined`
- SurveyJS 會自動在題目上方顯示圖片

## 資料庫驗證

```sql
-- surveys 表有 cover_image_url 欄位
\d surveys
-- 結果: cover_image_url | text | |

-- survey_questions 表有 image_url 欄位
\d survey_questions
-- 結果: image_url | text | |
```

## E2E 測試

已建立測試檔案: `apps/web/e2e/image-feature-qua279.spec.ts`

測試案例:
1. ✅ 上傳並顯示問卷封面圖片
2. ✅ 上傳並顯示問題圖片
3. ✅ 在任務卡片中顯示封面圖片
4. ✅ 移除封面圖片
5. ✅ 驗證圖片檔案類型和大小

## 欄位映射

| 前端欄位 | 後端欄位 | 資料庫欄位 |
|---------|---------|-----------|
| coverImageUrl | coverImageUrl | cover_image_url |
| question.imageUrl | imageUrl | image_url |

## 測試建議

1. **問卷編輯流程測試**
   - 建立新問卷
   - 上傳封面圖片
   - 新增問題並上傳問題圖片
   - 儲存問卷

2. **問卷顯示測試**
   - 檢查任務列表卡片是否有背景圖片
   - 開啟問卷填答頁面
   - 驗證問題圖片正確顯示

3. **圖片驗證測試**
   - 嘗試上傳非圖片檔案 (應顯示錯誤)
   - 嘗試上傳超大檔案 (應顯示錯誤)
   - 上傳後移除圖片

4. **UI/UX 測試**
   - 圖片上傳時顯示 loading 狀態
   - hover 時顯示操作按鈕 (換圖/移除)
   - 手機版面圖片顯示正常

## 已知限制

1. 圖片大小限制: 5MB
2. 支援格式: JPEG, PNG, GIF, WebP, SVG
3. URL 長度限制: 500 字元

## 結論

QUA-279 圖片功能已完整實作，包括:
- ✅ 問卷封面圖片上傳
- ✅ 問題圖片上傳
- ✅ 任務卡片背景圖片顯示
- ✅ 問卷填答頁面問題圖片顯示
- ✅ 完整的前後端整合
- ✅ 資料庫欄位已存在

功能已準備好進行正式測試。