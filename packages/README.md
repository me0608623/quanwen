# Packages

`packages/` 放置 QuanWen monorepo 內可被多個 app 共用的套件。這些套件以工作區（pnpm workspace）形式被 `apps/api`、`apps/web` 或其他內部服務引用，用來集中維護跨專案的型別與報表生成邏輯。

## 套件總覽

| 套件 | 目的 | 主要使用者 |
| --- | --- | --- |
| [`shared-types`](./shared-types/) | 集中定義前後端共用的 TypeScript 型別，避免 API 與前端資料契約分歧。 | `apps/api`、`apps/web` |
| [`@quanwen/report-generator`](./report-generator/) | 問卷報表產生引擎，負責建立 AI 報表 prompt、載入報表模板 skill，並從 AI 回應中抽取可預覽/儲存的 HTML。 | 主要供 API 或後續報表服務使用 |

## `shared-types`

`shared-types` 是前後端共用型別套件，目前匯出使用者、認證與 API 回應相關型別。

### 目前內容

- `UserRole`、`UserStatus`：使用者角色與狀態列舉型別。
- `User`：使用者基本資料結構。
- `ApiResponse<T>`：標準 API 回應 envelope。
- `PaginatedResponse<T>`：分頁 API 回應 envelope。
- `AuthResult`：登入/註冊後回傳的使用者摘要與 token。

### 使用情境

- API 回傳格式與 web 端接收型別需要保持一致時。
- 多個 app 都會用到同一份資料契約時。
- 新增跨 app 共用資料結構時，優先考慮放在這裡，避免在各 app 重複定義。

## `@quanwen/report-generator`

`@quanwen/report-generator` 是問卷報表產生相關邏輯的共用套件，採 ESM 模組格式，原始碼位於 `src/`。

### 目前內容

- `extract-html.ts`
  - `extractHtml()`：從可能包含說明文字、Markdown code fence 或串流片段的 AI 回應中抽出 HTML 文件。
  - `previewHtml()`：在 HTML 尚未完整結束時補上結尾標籤，方便 iframe 類預覽場景使用。
- `prompt-builder.ts`
  - `SurveyReportData`、`SurveyQuestionResult`：問卷報表資料輸入型別。
  - `buildReportPrompt()`：依指定模板 skill 與問卷資料建立完整 AI 報表生成 prompt。
  - `buildSurveyReport()`：從 skill 目錄載入模板後建立報表 prompt 的便利函式。
- `skills.ts`
  - `loadSkill()`：載入單一報表模板 skill。
  - `listSkills()`：列出指定目錄底下可用的報表模板 metadata。
  - 支援 `SKILL.md` frontmatter 與選用的 `example.md` / `example.html`。

### 使用情境

- 需要把問卷統計資料轉成可視覺化 HTML 報表時。
- 需要讓不同報表模板以檔案資料夾方式新增，而不是改動程式碼時。
- 需要從 AI agent 的回應中穩定抽取 HTML 內容做預覽或保存時。

## 維護原則

- 只放「跨 app 共用」且有明確邊界的程式碼或型別。
- 新增套件時，應在本 README 補上用途、主要匯出內容與使用情境。
- 型別契約變更時，需同步確認依賴該型別的 app 是否需要調整。
- 報表模板若能以資料夾與 `SKILL.md` 表達，優先透過模板新增，避免把模板細節硬編碼進報表引擎。
