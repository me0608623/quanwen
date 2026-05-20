# 券問 QuanWen — 開發者手冊

> **給 AI / 新成員的第一句話**：先讀這份 README，再讀
> `C:\Users\User\Documents\問券\CLAUDE.md`（產品規格、法規紅線、功能優先序）。
> 兩份文件讀完才算完整掌握背景。

---

## 1. 專案是什麼

**券問 QuanWen** 是台灣雙邊問卷媒合平台：

| 角色 | 英文 key | 行動 |
|------|---------|------|
| 問券方 | `surveyor` | 發布問卷、設定獎勵與目標受眾 |
| 受試者 | `respondent` | 接案填寫，獲取現金 / 禮券 / 積分 |
| 平台 | `admin` | AI 品質審核、金流託管、反作弊 |

差異化：在地 7-11/全家 通路 + AI 三層品質審核 + 雙邊自助。

---

## 2. 技術棧

| 層 | 技術 | 版本 |
|----|------|------|
| 後端框架 | NestJS | 10 |
| 前端框架 | Next.js App Router | 14.2 |
| ORM | Drizzle ORM | 0.30 |
| 本機 DB (dev) | `@electric-sql/pglite` in-memory | 0.4.x |
| 生產 DB | PostgreSQL | 16 |
| 語言 | TypeScript strict | 5.4 |
| 驗證 | Zod | 3 |
| 認證 | JWT (passport-jwt) + Google / LINE / Apple OAuth | — |
| AI 審核 | Z.ai GLM-5.1 | — |
| 前端狀態 | TanStack Query v5 | — |
| 表單 | React Hook Form | — |
| UI 元件 | Radix UI + shadcn/ui + Tailwind | — |
| 套件管理 | pnpm 9 workspaces | — |
| 測試 | Vitest (unit) + Playwright (E2E) | — |

---

## 3. 資料夾結構

```
quanwen/                          ← monorepo root
├── .env                          ← 本機環境變數（已 gitignore）
├── .env.example                  ← 範本，提交版本
├── pnpm-workspace.yaml
├── package.json                  ← 根層 scripts (pnpm dev / test / lint)
├── docker-compose.yml            ← 可選：啟動 PostgreSQL + Redis
│
├── apps/
│   ├── api/                      ← NestJS 後端 (port 3001)
│   │   └── src/
│   │       ├── main.ts           ← 啟動、dotenv 載入、Swagger
│   │       ├── app.module.ts     ← 根模組（組合所有子模組）
│   │       ├── db/
│   │       │   ├── database.module.ts  ← @Global() DB provider，PGlite / pg 雙模式
│   │       │   ├── schema/
│   │       │   │   ├── index.ts        ← re-export all schemas
│   │       │   │   ├── users.ts        ← users + oauth_accounts
│   │       │   │   ├── profiles.ts     ← respondent_profiles + surveyor_profiles
│   │       │   │   └── tags.ts         ← interest_tags + respondent_tags
│   │       │   └── index.ts            ← re-export DatabaseModule, DB token, AppDb
│   │       ├── auth/
│   │       │   ├── auth.module.ts
│   │       │   ├── auth.controller.ts  ← POST /auth/register|login, GET /auth/me|google
│   │       │   ├── auth.service.ts     ← register / login / OAuth upsert
│   │       │   ├── dto/
│   │       │   │   ├── register.dto.ts (Zod)
│   │       │   │   └── login.dto.ts    (Zod)
│   │       │   ├── guards/
│   │       │   │   └── jwt-auth.guard.ts
│   │       │   └── strategies/
│   │       │       ├── jwt.strategy.ts
│   │       │       └── google.strategy.ts
│   │       ├── profile/
│   │       │   ├── profile.module.ts
│   │       │   ├── profile.controller.ts ← GET /profile/me, PUT /profile/respondent|surveyor
│   │       │   ├── profile.service.ts    ← upsert profiles + tag diff
│   │       │   └── dto/
│   │       │       ├── update-respondent-profile.dto.ts (Zod)
│   │       │       └── update-surveyor-profile.dto.ts   (Zod)
│   │       ├── tags/
│   │       │   ├── tags.module.ts
│   │       │   ├── tags.controller.ts  ← GET /tags (public)
│   │       │   ├── tags.service.ts     ← onModuleInit seed + findAll
│   │       │   └── tags.seed.ts        ← 23 個預設標籤 + TW_REGIONS
│   │       ├── surveys/
│   │       │   ├── surveys.module.ts   ← 引入 AiAuditModule
│   │       │   ├── surveys.controller.ts ← POST|GET|PUT|DELETE /surveys, POST /surveys/ai-draft
│   │       │   ├── surveys.service.ts  ← CRUD + publish + AI 草稿
│   │       │   └── dto/
│   │       │       ├── create-survey.dto.ts   (Zod)
│   │       │       ├── update-survey.dto.ts   (Zod, partial of create)
│   │       │       └── ai-draft.dto.ts        (Zod)
│   │       ├── ai-audit/
│   │       │   ├── ai-audit.module.ts  ← 提供 ZaiClient
│   │       │   └── zai.client.ts       ← ZaiClient: chat() / jsonChat<T>()
│   │       └── common/
│   │           ├── pipes/zod-validation.pipe.ts
│   │           └── filters/http-exception.filter.ts
│   │
│   └── web/                      ← Next.js 前端 (port 3000)
│       └── src/
│           ├── app/
│           │   ├── layout.tsx / page.tsx / providers.tsx
│           │   ├── auth/
│           │   │   ├── login/page.tsx
│           │   │   ├── register/page.tsx
│           │   │   └── callback/page.tsx    ← OAuth callback（Suspense 包裹）
│           │   ├── onboarding/
│           │   │   ├── page.tsx            ← respondent 資料填寫 + tag 選擇
│           │   │   └── surveyor/page.tsx   ← surveyor 機構/目的填寫
│           │   ├── dashboard/page.tsx      ← (stub) 問券方後台
│           │   └── tasks/page.tsx          ← (stub) 受試者問卷列表
│           ├── components/forms/
│           │   └── tag-selector.tsx        ← 標籤多選元件（分類顯示，max 10）
│           ├── components/survey-editor/
│           │   ├── question-editor.tsx     ← 單題編輯（類型/選項/必填）
│           │   └── ai-draft-panel.tsx      ← AI 草稿 panel（輸入主題 → GLM-5.1）
│           ├── app/dashboard/
│           │   ├── page.tsx                ← 問卷列表首頁
│           │   └── surveys/
│           │       ├── new/page.tsx        ← 新建問卷 + AI 草稿
│           │       └── [id]/page.tsx       ← 問卷詳情 / 編輯 / 統計
│           ├── hooks/
│           │   ├── use-auth.ts             ← useMe / useLogin / useRegister / useLogout
│           │   ├── use-profile.ts          ← useMyProfile / useTags / useUpdate*Profile
│           │   └── use-surveys.ts          ← useMySurveys / useSurvey / useCreate|Update|Publish|Delete + useAiDraft
│           └── lib/
│               └── api.ts                  ← axios instance（自動帶 Bearer token）
│
└── packages/
    └── shared-types/             ← 前後端共用型別（目前尚未填入）
```

---

## 4. 如何在本機跑起來（無需 Docker / PostgreSQL）

### 前置需求

- Node.js ≥ 20（Cursor 內建 Node 可用）
- pnpm 9（下方有安裝方式）

```bash
# 若 pnpm 未安裝（Windows Git Bash）
curl -fsSL https://get.pnpm.io/install.sh | sh -
# 或手動：下載 pnpm standalone tarball 解壓到 ~/.local/bin/pnpm
```

### 啟動流程

```bash
cd C:\Users\User\Documents\quanwen

# 1. 複製環境變數
cp .env.example .env
# 編輯 .env，至少設定以下欄位：
#   JWT_SECRET=<64 字元隨機字串>
#   ZAI_API_KEY=<你的 Z.ai key>
#   USE_PG_MEM=true   ← 使用 PGlite 不需要 PostgreSQL

# 2. 安裝依賴
pnpm install

# 3. 啟動前後端（分開兩個終端機）
pnpm --filter api dev    # http://localhost:3001
pnpm --filter web dev    # http://localhost:3000
```

> **PGlite 說明**：設定 `USE_PG_MEM=true` 時，API 啟動時會建立 in-memory
> PostgreSQL（由 `@electric-sql/pglite` 提供），並自動執行所有 DDL。
> 資料不會持久化（重啟即清空），適合開發測試。
> 要切換真實 PostgreSQL，設定 `USE_PG_MEM=false` 並填入 `DATABASE_URL`。

---

## 5. 環境變數說明

| 變數 | 必填 | 說明 |
|------|------|------|
| `USE_PG_MEM` | dev 建議 | `true` = PGlite in-memory，`false` = 真實 PostgreSQL |
| `DATABASE_URL` | 生產 | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | 必填 | 至少 64 字元，簽發 JWT |
| `JWT_EXPIRES_IN` | 選填 | 預設 `7d` |
| `GOOGLE_CLIENT_ID` | OAuth | Google Cloud Console 取得 |
| `GOOGLE_CLIENT_SECRET` | OAuth | — |
| `GOOGLE_CALLBACK_URL` | OAuth | 預設 `http://localhost:3001/api/v1/auth/google/callback` |
| `ZAI_API_KEY` | AI 功能 | Z.ai 後台取得（格式：`xxx.yyy`） |
| `ZAI_BASE_URL` | 選填 | 預設 `https://api.z.ai/api/paas/v4` |
| `ZAI_MODEL` | 選填 | 預設 `glm-5.1` |
| `WEB_URL` | CORS | 預設 `http://localhost:3000` |
| `API_URL` | 前端 | 前端 axios baseURL，預設 `http://localhost:3001/api/v1` |
| `PORT` | 選填 | API port，預設 `3001` |

---

## 6. 資料庫 Schema（當前版本）

### Sprint 1 — 認證核心

```sql
-- 使用者主表
users (
  id             UUID PK,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255),          -- null = OAuth only
  role           user_role NOT NULL,    -- 'surveyor'|'respondent'|'admin'
  status         user_status DEFAULT 'active', -- 'active'|'suspended'|'pending_verify'
  display_name   VARCHAR(100) NOT NULL,
  avatar_url     TEXT,
  email_verified BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ            -- soft delete
)

-- OAuth 綁定
oauth_accounts (
  id                  UUID PK,
  user_id             UUID FK → users,
  provider            auth_provider,    -- 'email'|'google'|'line'
  provider_account_id VARCHAR(255),
  access_token        TEXT,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ
)
```

### Sprint 2 — 個人資料 + 標籤

```sql
-- 受試者 profile（1:1 → users）
respondent_profiles (
  id                UUID PK,
  user_id           UUID UNIQUE FK → users,
  age_range         age_range,          -- 'under_18'|'18_24'|'25_34'|'35_44'|'45_54'|'55_plus'
  gender            gender,             -- 'male'|'female'|'non_binary'|'prefer_not_to_say'
  region            VARCHAR(20),        -- 台北市、新北市 ...
  occupation        occupation,         -- 'student'|'employed_full_time'|...
  education         education,          -- 'junior_high'|'senior_high'|'bachelor'|...
  reputation_score  INTEGER DEFAULT 60, -- 信譽分（0-100）
  completion_rate   NUMERIC(5,2),       -- 完成率 %
  total_completed   INTEGER DEFAULT 0,
  is_onboarding_done BOOLEAN DEFAULT false
)

-- 問券方 profile（1:1 → users）
surveyor_profiles (
  id                UUID PK,
  user_id           UUID UNIQUE FK → users,
  institution_name  VARCHAR(200),
  research_purpose  VARCHAR(500),
  is_verified       BOOLEAN DEFAULT false,
  is_onboarding_done BOOLEAN DEFAULT false
)

-- 興趣標籤主表（系統預設 23 個）
interest_tags (
  id         UUID PK,
  name       VARCHAR(50) UNIQUE NOT NULL,
  category   tag_category,  -- 'tech'|'lifestyle'|'finance'|'health'|...
  sort_order INTEGER DEFAULT 0
)

-- 受試者 ↔ 標籤 (many-to-many)
respondent_tags (
  respondent_profile_id UUID FK → respondent_profiles,
  tag_id                UUID FK → interest_tags,
  PRIMARY KEY (respondent_profile_id, tag_id)
)
```

### Sprint 3+ — 問卷（待實作）

```sql
-- 見「8. Sprint 規劃」
```

---

## 7. API 端點（當前版本）

> Base URL: `http://localhost:3001/api/v1`
> Swagger UI: `http://localhost:3001/docs`
> 🔒 = 需要 `Authorization: Bearer <JWT>`

### Auth

| Method | Path | 說明 |
|--------|------|------|
| POST | `/auth/register` | 註冊（email+password，回傳 JWT） |
| POST | `/auth/login` | 登入（回傳 JWT） |
| GET  | `/auth/me` 🔒 | 取得目前使用者資訊 |
| GET  | `/auth/google` | 觸發 Google OAuth |
| GET  | `/auth/google/callback` | Google OAuth callback |
| GET  | `/auth/line` | 跳轉 LINE 授權 |
| GET  | `/auth/line/callback` | LINE OAuth callback |
| GET  | `/auth/apple` | 跳轉 Apple 授權 |
| POST | `/auth/apple/callback` | Apple form_post callback |
| POST | `/auth/select-role` 🔒 | 新 OAuth 用戶選擇角色 |
| POST | `/auth/profile` 🔒 | 更新暱稱 |
| GET  | `/auth/linked-providers` 🔒 | 已綁定第三方列表 |
| DELETE | `/auth/linked-providers/:provider` 🔒 | 解除第三方綁定 |
| GET  | `/auth/bind/google\|line\|apple` 🔒 | 新增第三方綁定 |

**Register body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "王小明",
  "role": "respondent"
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "email": "...", "displayName": "...", "role": "respondent" },
  "token": "eyJhbGci..."
}
```

### Profile

| Method | Path | 說明 |
|--------|------|------|
| GET  | `/profile/me` 🔒 | 取得自己的 profile（含 tags） |
| PUT  | `/profile/respondent` 🔒 | 更新受試者 profile（upsert） |
| PUT  | `/profile/surveyor` 🔒 | 更新問券方 profile（upsert） |

**PUT /profile/respondent body:**
```json
{
  "ageRange": "25_34",
  "gender": "male",
  "region": "台北市",
  "occupation": "employed_full_time",
  "education": "bachelor",
  "tagIds": ["uuid1", "uuid2"]
}
```

### Tags

| Method | Path | 說明 |
|--------|------|------|
| GET | `/tags` | 取得所有興趣標籤（public） |

---

## 8. Sprint 規劃（6 個月 MVP）

| Sprint | 月 | 主題 | 狀態 |
|--------|---|------|------|
| 1–2 | M1 | Foundation + 三方註冊登入 | ✅ 完成 |
| 3–4 | M2 | 問卷編輯器 + AI 草稿生成 | 🚧 進行中 |
| 5–6 | M3 | 媒合 + 填答 + 反作弊基礎 | ⬜ 待開始 |
| 7–8 | M4 | AI 品質審核 + 綠界儲值 | ⬜ 待開始 |
| 9–10 | M5 | 分析報表 + 平台後台 | ⬜ 待開始 |
| 11–12 | M6 | 通知 + Beta + 上線 | ⬜ 待開始 |

### Sprint 1–2（M1）✅ 已完成

- [x] Monorepo 骨架（pnpm workspaces，apps/api + apps/web + packages/shared-types）
- [x] NestJS + Drizzle + PGlite（dev 無需 PostgreSQL）
- [x] `users` + `oauth_accounts` schema
- [x] Email 註冊 / 登入（bcrypt + JWT）
- [x] Google OAuth（passport-google-oauth20）
- [x] ZodValidationPipe + GlobalExceptionFilter
- [x] Swagger UI（`/docs`）
- [x] Rate limiting（ThrottlerModule）
- [x] 前端登入/註冊表單（React Hook Form + Zod）
- [x] `useAuth` hooks（useLogin / useRegister / useMe / useLogout）
- [x] axios instance（auto Bearer token）
- [x] OAuth callback page（含 Suspense）

### Sprint 2（M1 尾 / M2 初）✅ 已完成

- [x] `respondent_profiles` + `surveyor_profiles` schema
- [x] `interest_tags` + `respondent_tags` schema（many-to-many）
- [x] DDL 同步進 PGlite `useFactory`
- [x] `TagsService`（`onModuleInit` seed 23 個標籤）
- [x] `GET /tags` 公開端點
- [x] `ProfileService`（upsert respondent + tag diff，upsert surveyor）
- [x] `GET /profile/me`，`PUT /profile/respondent`，`PUT /profile/surveyor`
- [x] `TagSelector` 元件（分類顯示，max 10）
- [x] 受試者 onboarding 頁（`/onboarding`）
- [x] 問券方 onboarding 頁（`/onboarding/surveyor`）
- [x] Dashboard / Tasks stub 頁（避免 typedRoutes 報錯）
- [x] 註冊後 redirect 至 onboarding（而非直接進後台）

### Sprint 3（M2）✅ 已完成

- [x] `surveys` + `survey_questions` + `question_options` schema
- [x] DDL 同步進 PGlite `useFactory`
- [x] `SurveysService`：create / findMine / findOneDetailed / update / publish / remove / generateAiDraft
- [x] `POST /surveys`、`GET /surveys`、`GET /surveys/:id`、`PUT /surveys/:id`
- [x] `POST /surveys/:id/publish`（→ pending_review）
- [x] `DELETE /surveys/:id`
- [x] `POST /surveys/ai-draft`（GLM-5.1 產生題目 JSON）
- [x] `AiAuditModule` 包裝 ZaiClient，供 SurveysModule 引入
- [x] `use-surveys.ts` hooks（useMySurveys / useSurvey / useCreate / useUpdate / usePublish / useDelete / useAiDraft）
- [x] `QuestionEditor` 元件（單選/多選/文字/評分/矩陣，支援選項增刪）
- [x] `AiDraftPanel` 元件（輸入主題 → 呼叫 AI → 自動填入編輯器）
- [x] `/dashboard/surveys/new` — 新建問卷頁（含 AI 草稿按鈕）
- [x] `/dashboard/surveys/[id]` — 問卷詳情 / 編輯頁（含狀態顯示、統計）
- [x] `/dashboard` — 問卷列表首頁（替換 stub）

### Sprint 4（M2 尾）✅ 已完成

- [x] `survey_responses` + `response_answers` schema（含 unique 防重複提交）
- [x] DDL 同步進 PGlite `useFactory`
- [x] `ResponsesService`：getAvailableSurveys（受眾媒合篩選）/ getPublicSurvey / submitResponse（防重複、遞增配額、自動關閉）/ getMyResponses / getSurveyStats（逐題彙整）
- [x] `TasksController`（`/tasks`）：受試者問卷列表、詳情、提交
- [x] `ResponsesController`（`/surveys/:id/stats`）：問券方統計
- [x] `use-responses.ts` hooks（useAvailableSurveys / usePublicSurvey / useMyResponses / useSubmitResponse）
- [x] `/tasks` — 可填問卷列表 + 填答紀錄 tab
- [x] `/tasks/[id]` — 完整填答頁（單選/多選/文字/評分 四種題型）
- [x] `/dashboard/surveys/[id]/stats` — 問卷統計頁（bar chart、平均分、文字抽樣）
- [x] 問卷詳情頁補「查看詳細統計」連結

### Sprint 5（M3）✅ 已完成

- [x] `AiAuditService.auditSurveyAsync()`：fire-and-forget，評分 0-100，≥60 → `published`，<60 → `rejected`
- [x] 問卷審核 prompt 涵蓋：清晰度/題型多樣性/中立性/連貫性四維度；含政治煽動等直接 0 分
- [x] AI 失敗自動通過（避免卡審）；成功後寫入 `aiScore`、`aiRejectReason`、`publishedAt`
- [x] `survey_responses` 加入 `fill_duration_seconds`、`anti_cheat_score`、`suspicious_flags`
- [x] `AntiCheatService.evaluate()`：填答速度 / 文字題太短 / 全選同一選項 / 回答數不足
- [x] `score >= 80` → response 標記 `rejected`，不計入配額；前端顯示警示
- [x] 填答頁記錄 `startedAt`（`useRef`），提交時附帶送出
- [x] `submitResponse` 成功後更新 `respondentProfiles.totalCompleted`（每 10 份 +1 信譽分）
- [x] `/profile` 頁面：信譽分圓形進度條、等級標籤、統計數字、個人資料摘要、最近填答

### Sprint 6（M3 尾）✅ 完成

目標：通知系統 + 平台後台（管理員）

**後端**
- [x] `notifications` schema（DB + PGlite DDL）：`notification_type` enum、`notifications` table
- [x] `NotificationsService`：`create / findByUser / countUnread / markRead / markAllRead`
- [x] `NotificationsController`：GET `/notifications`、GET `/notifications/unread-count`、PUT `/notifications/:id/read`、PUT `/notifications/read-all`
- [x] `AiAuditService` 審核後自動發通知（`survey_approved` / `survey_rejected`）
- [x] `AdminGuard`：檢查 `req.user.role === 'admin'`
- [x] `AdminService`：`getPendingSurveys / approveSurvey / rejectSurvey / closeSurvey / getSuspiciousResponses / rejectResponse / getPlatformStats`
- [x] `AdminController`（`@UseGuards(JwtAuthGuard, AdminGuard)`）：GET `/admin/stats`、GET `/admin/surveys`、POST `/admin/surveys/:id/approve|reject|close`、GET `/admin/responses/suspicious`、POST `/admin/responses/:id/reject`
- [x] 審核通過/拒絕後自動發通知給問券方

**前端**
- [x] `use-notifications.ts`：`useNotifications / useUnreadCount / useMarkRead / useMarkAllRead`
- [x] `use-admin.ts`：`usePlatformStats / useAdminSurveys / useApproveSurvey / useRejectSurvey / useSuspiciousResponses / useRejectResponse`
- [x] `components/layout/navbar.tsx`：通知鈴鐺（unread badge）、角色路由（admin / surveyor / respondent）、登出
- [x] `app/layout.tsx`：全域加入 `<Navbar />`
- [x] `app/notifications/page.tsx`：通知列表、點擊導向、全部已讀、未讀小紅點
- [x] `app/admin/page.tsx`：平台總覽（用戶 / 問卷 / 填答統計卡片）
- [x] `app/admin/surveys/page.tsx`：問卷審核列表、狀態篩選、通過/拒絕（含原因 dialog）
- [x] `app/admin/responses/page.tsx`：可疑填答列表、可疑分數 badge、標記無效

---

### Sprint 7（M4）✅ 完成

目標：金流帳務系統（錢包 + 複式記帳 + 自動獎勵 + 提領申請）

**後端**
- [x] `wallets` schema：`cashBalance / lockedCash / pointsBalance / version`（integer NT$，CHECK >= 0）
- [x] `transactions` schema：`transaction_type` enum（deposit/reward_out/reward_in/platform_fee/withdraw_request/withdraw_complete/refund）、冪等 unique constraint `(external_provider, external_ref)`
- [x] `journal_entries` schema：複式記帳分錄，每筆 transaction 對應借貸兩邊
- [x] DDL 同步進 PGlite `useFactory`（Sprint 7 區塊）
- [x] `WalletService`：`ensureWallet / getWallet / getTransactions / mockDeposit / issueReward / requestWithdrawal / checkSurveyBudget`
- [x] `issueReward()`：問券方扣款（rewardAmount + 10% 平台費），受試者入帳；餘額不足 → `pending` 狀態
- [x] `requestWithdrawal()`：每日上限 NT$30,000、最小 NT$300 防呆；鎖定 `lockedCash`
- [x] `mockDeposit()`：開發用儲值（正式替換為 ECPay webhook）
- [x] `WalletController`：GET `/wallet`、GET `/wallet/transactions`、POST `/wallet/deposit`（mock）、POST `/wallet/withdraw`
- [x] `ResponsesService.submitResponse()` 成功後 fire-and-forget `walletService.issueReward(...)`

**前端**
- [x] `use-wallet.ts`：`useWallet / useWalletTransactions / useMockDeposit / useRequestWithdrawal`
- [x] `/wallet` 頁面：餘額卡片、儲值 dialog（問券方）、提領 dialog（受試者，含銀行資訊欄位）、交易紀錄列表
- [x] Navbar 加入「錢包」（問券方）/ 「我的收益」（受試者）連結

---

### Sprint 8（M4 尾）✅ 完成

目標：完整金流循環（預算鎖定 + 問卷關閉退款 + 管理員提領審核 + 發布前預算警告）

**後端**
- [x] `WalletService.lockSurveyBudget()`：送審時將 `rewardPoints × targetCount` 移至 `lockedCash`（不阻擋，餘額不足只鎖可用部分）
- [x] `WalletService.unlockSurveyBudget()`：問卷關閉退回未用預算（`completedCount` 以外的部分）
- [x] `WalletService.getPendingWithdrawals() / approveWithdrawal() / rejectWithdrawal()`：管理員提領審核
- [x] `SurveysService.publish()` 送審後 fire-and-forget `lockSurveyBudget()`
- [x] `AdminService.closeSurvey()` 關閉後 fire-and-forget `unlockSurveyBudget()`
- [x] `AdminService.getPendingWithdrawals() / approveWithdrawal() / rejectWithdrawal()`
- [x] `AdminController`：GET `/admin/withdrawals`、POST `/admin/withdrawals/:id/approve|reject`
- [x] `SurveysController`：GET `/surveys/:id/budget-check`（含錢包餘額 vs 所需預算）
- [x] `SurveysModule` 引入 `WalletModule`；`AdminModule` 引入 `WalletModule`

**前端**
- [x] `use-surveys.ts` 加入 `useBudgetCheck(surveyId)`
- [x] `use-admin.ts` 加入 `usePendingWithdrawals / useApproveWithdrawal / useRejectWithdrawal`
- [x] 問卷詳情頁：預算不足 banner（顯示差額 + 前往儲值連結）+ 發布 confirm 提示
- [x] `app/admin/withdrawals/page.tsx`：待審提領列表、核准撥款、拒絕（含原因 dialog）
- [x] Navbar 管理員選單加入「提領審核」

---

### Sprint 9（M5）✅ 完成

目標：分析報表（趨勢圖、CSV 匯出、受試者收益摘要、平台收入統計）

**後端**
- [x] `ResponsesService.getSurveyTrend()` — 近 30 天每日填答數，補齊空日期，依台北時區分組
- [x] `ResponsesService.exportSurveyResponsesCsv()` — 匯出所有已提交填答為 CSV（含 BOM for Excel），多選展開 label
- [x] `ResponsesController` 加入 `GET /surveys/:id/trend` 和 `GET /surveys/:id/export`（Content-Disposition 下載）
- [x] `WalletService.getEarningsSummary()` — 受試者：累計、本月、待入帳、各問卷收益、近 6 月月收益
- [x] `WalletController` 加入 `GET /wallet/earnings-summary`
- [x] `AdminService.getPlatformStats()` 擴充：加入 `platformRevenue`（累計）、`platformRevenueThisMonth`（本月）

**前端**
- [x] `useSurveyTrend(surveyId)` hook
- [x] `useEarningsSummary()` hook
- [x] 統計頁 (`/dashboard/surveys/[id]/stats`)：加入近 14 天趨勢 CSS bar chart、匯出 CSV 按鈕（fetch + blob 觸發下載）、選項依比例排序
- [x] `/earnings` 頁面：總覽卡片（累計/本月/待入帳）、月收益 CSS bar chart、各問卷收益列表
- [x] Admin 總覽頁：加入「平台收入」區塊（本月 + 累計手續費）+ 提領審核快捷連結
- [x] Navbar 受試者選單：「我的收益」→ `/earnings`，「錢包」→ `/wallet`

---

### Sprint 10（M5 尾）✅ 完成

目標：多方 OAuth（Google ✅ LINE ✅ Apple ✅）+ 帳號綁定 + 角色選擇 + 個人資訊編輯

**後端**
- [x] `authProviderEnum` 加入 `'apple'`（schema + PGlite DDL）
- [x] LINE OAuth 直接以 `fetch` 實作（不需 `passport-line`）：`exchangeLineCode / getLineProfile / extractEmailFromIdToken`
- [x] Apple Sign In 直接以 `fetch` 實作：`generateAppleClientSecret`（ES256 JWT, Node crypto）/ `exchangeAppleCode / parseAppleIdToken`
- [x] `findOrCreateOAuthUser()` 支援 `'google' | 'line' | 'apple'` + 回傳 `isNewUser` flag + `bindToUserId` 參數
- [x] `selectRole(userId, role)` — 新 OAuth 用戶選擇角色後重簽 JWT
- [x] `updateDisplayName(userId, displayName)` — 更新顯示名稱
- [x] `getLinkedProviders(userId)` — 取得已綁定的第三方帳號列表
- [x] `unbindProvider(userId, provider)` — 解除綁定（至少保留一種登入方式的防呆）
- [x] `createBindSession / resolveBindSession` — in-memory 綁定 session（10 分鐘 TTL）
- [x] `AuthController` 新增端點：
  - `GET /auth/line` → 跳轉 LINE 授權
  - `GET /auth/line/callback` → 換碼、取 profile、找/建用戶
  - `GET /auth/apple` → 跳轉 Apple 授權
  - `POST /auth/apple/callback` → Apple form_post 回調（交換 code）
  - `GET /auth/bind/google|line|apple` 🔒 → 已登入用戶新增綁定
  - `POST /auth/select-role` 🔒 → 新 OAuth 用戶選擇角色
  - `POST /auth/profile` 🔒 → 更新暱稱
  - `GET /auth/linked-providers` 🔒 → 已綁定列表
  - `DELETE /auth/linked-providers/:provider` 🔒 → 解除綁定
- [x] `main.ts` 加入 `express.urlencoded()` middleware（Apple form_post 需要）
- [x] `.env.example` 補 `LINE_*` 和 `APPLE_*` 環境變數說明

**前端**
- [x] `use-auth.ts` 新增：`useSelectRole / useUpdateProfile / useLinkedProviders / useUnbindProvider`
- [x] 登入頁加入 LINE + Apple 第三方登入按鈕
- [x] `app/auth/select-role/page.tsx` — 新 OAuth 用戶選擇角色（問券方 / 受試者）
- [x] `app/settings/accounts/page.tsx` — 帳號連結管理：顯示已綁 / 未綁 providers、綁定按鈕、解除綁定確認
- [x] `app/profile/page.tsx` — 加入暱稱編輯（inline），加入「帳號連結設定 →」連結
- [x] Navbar：問券方 + 受試者均加入「帳號」→ `/settings/accounts`

**Sprint 10 第二階段（同日後補）**
- [x] `selectRole()` 支援可選 `displayName` 參數（新 OAuth 用戶可同步設定暱稱）
- [x] `changeEmail()` — 允許使用者更換電子郵件（placeholder email 用戶必填）
- [x] `setPassword()` — OAuth-only 用戶首次設定密碼
- [x] `changePassword()` — 現有密碼更改（需驗證舊密碼）
- [x] `hasPassword()` — 查詢帳號是否已有密碼
- [x] `GET /auth/security` 🔒 — 回傳 `{ hasPassword, linkedProviders }`
- [x] `POST /auth/security/change-email` 🔒
- [x] `POST /auth/security/set-password` 🔒
- [x] `POST /auth/security/change-password` 🔒
- [x] `select-role/page.tsx` 加入暱稱輸入欄位（用於 OAuth 新用戶自訂名稱）
- [x] `auth/register/page.tsx` 加入 Google / LINE / Apple 快速建立帳號按鈕
- [x] `app/settings/layout.tsx` — 設定頁共用 tab 導覽（帳號連結 / 帳號安全）
- [x] `app/settings/security/page.tsx` — 電子郵件更新、設定/更改密碼、登入方式摘要
- [x] `use-auth.ts` 新增：`useSecurityInfo / useChangeEmail / useSetPassword / useChangePassword`
- [x] Profile 頁面：加入「帳號安全」快捷連結

**環境變數（新增）**
| 變數 | 用途 |
|------|------|
| `LINE_CHANNEL_ID` | LINE Developers Channel ID |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret |
| `LINE_CALLBACK_URL` | `http://localhost:3001/api/v1/auth/line/callback` |
| `APPLE_CLIENT_ID` | Apple Services ID |
| `APPLE_TEAM_ID` | Apple 10 字元 Team ID |
| `APPLE_KEY_ID` | Apple 10 字元 Key ID |
| `APPLE_PRIVATE_KEY` | `.p8` EC 私鑰（換行用 `\n`） |
| `APPLE_CALLBACK_URL` | `http://localhost:3001/api/v1/auth/apple/callback` |

---

## 9. 核心架構決定（ADR 摘要）

| # | 決定 | 原因 |
|---|------|------|
| ADR-001 | Modular Monolith（非微服務） | MVP 期間避免過早複雜化 |
| ADR-002 | PostgreSQL for everything | jsonb + pgvector + pg_trgm，一個 DB 搞定 |
| ADR-003 | Drizzle ORM | 型別安全、輕量、支援 PGlite |
| ADR-004 | NestJS + BullMQ | 模組化、DI、非同步任務隊列 |
| ADR-005 | OpenAPI SSOT | 前後端型別從同一份 spec 產生 |
| ADR-007 | 金額用 integer NT$ 元 | 避免浮點誤差，複式記帳 |
| ADR-008 | ECPay 第三方支付 | 電支法合規，平台帳永遠 = 0 |

---

## 10. 重要規則（不能違反）

```
❌ 金額存 float          ✅ 存 integer（新台幣元）
❌ 字串拼 SQL            ✅ Drizzle parameterized query
❌ req.body 不過 Zod     ✅ 永遠先 validate
❌ console.log token     ✅ logger.info + redact
❌ API key 寫進 code     ✅ process.env + Zod 驗證
❌ 受試者錢包稱「儲值」  ✅ 「待領獎勵」/「我的收益」
❌ 自行代收代付           ✅ 走 ECPay 綠界
❌ PII 傳給 OpenAI       ✅ 先去識別化
```

詳見 `C:\Users\User\Documents\問券\CLAUDE.md` 第 3 節與第 7 節。

---

## 11. Z.ai 整合說明

`ZaiClient`（`apps/api/src/ai-audit/zai.client.ts`）是一個 NestJS Injectable service，
目前尚未掛進 `AppModule`——待 Sprint 3 AI 草稿功能時一起引入。

```typescript
// 用法範例（在任何需要 AI 的 service）
@Injectable()
export class SurveysService {
  constructor(private readonly zai: ZaiClient) {}

  async generateDraft(topic: string) {
    return this.zai.jsonChat<DraftResult>(SYSTEM_PROMPT, topic);
  }
}
```

API Key 設定：`ZAI_API_KEY` 環境變數（格式 `xxx.yyy`）。

---

## 12. 常用指令速查

```bash
# 啟動
pnpm --filter api dev      # API  → http://localhost:3001
pnpm --filter web dev      # Web  → http://localhost:3000
pnpm dev                   # 兩者同時（parallel）

# 測試
pnpm test                  # 所有 unit tests
pnpm --filter api test     # API tests only

# 型別檢查
pnpm type-check

# Lint
pnpm lint

# DB（需關閉 USE_PG_MEM，指向真實 PG）
pnpm db:generate           # 產生 migration
pnpm db:push               # 直接 push schema（dev 用）
pnpm db:studio             # 開啟 Drizzle Studio GUI
```

---

## 13. 修訂紀錄

| 日期 | 版本 | 變動 |
|------|------|------|
| 2026-05-17 | v0.1 | Monorepo 骨架建立 |
| 2026-05-17 | v0.2 | Sprint 1 完成（Auth + JWT） |
| 2026-05-18 | v0.3 | Sprint 2 完成（Profile + Tags） |
| 2026-05-18 | v0.4 | 本 README 建立 |
| 2026-05-18 | v0.5 | Sprint 3 完成（SurveysModule + AI 草稿 + 前端問卷編輯器） |
| 2026-05-18 | v0.6 | Sprint 4 完成（ResponsesModule + 填答流程 + 統計頁） |
| 2026-05-18 | v0.7 | Sprint 5 完成（AI 審核 pipeline + 反作弊 + 信譽分 + /profile 頁） |
| 2026-05-18 | v0.8 | Sprint 6 完成（通知系統 + Admin 後台 + 前端管理頁面） |
| 2026-05-18 | v0.9 | Sprint 7 完成（金流帳務：錢包 + 複式記帳 + 自動獎勵 + 提領申請） |
| 2026-05-18 | v1.0 | Sprint 8 完成（預算鎖定/退款 + 管理員提領審核 + 發布預算警告） |
| 2026-05-18 | v1.1 | Sprint 9 完成（分析報表：趨勢圖 + CSV 匯出 + 收益摘要 + 平台收入） |
