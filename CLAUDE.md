# QuanWen — CLAUDE.md

## 專案根目錄結構

```
問券/                          ← Obsidian Vault + git root
├── CLAUDE.md                  ← 這個檔案
├── 00-首頁/  …  13-系統深度設計/  ← 設計藍圖 (SSOT)
└── quanwen/                   ← 實作 code ★
    ├── apps/
    │   ├── web/               ← Next.js 14
    │   └── api/               ← NestJS (WIP)
    ├── pnpm-workspace.yaml
    └── package.json
```

> **啟動方式:** 在 `問券/` 執行 `claude`，即可讀到此 CLAUDE.md 和所有設計藍圖。
> 跑 dev server: `cd quanwen && pnpm --filter web dev`

---

Monorepo: `apps/api` (NestJS + Drizzle) + `apps/web` (Next.js 14 App Router)

## Setup Checklist (Next.js)

When bootstrapping or diagnosing a missing-styles issue, verify ALL of these exist in `apps/web/`:

- [ ] `postcss.config.mjs` — **required** for Tailwind to compile; without it `@tailwind` directives are ignored
- [ ] `tailwind.config.ts` — must have `content` covering `./src/app/**` and `./src/components/**`
- [ ] `src/app/globals.css` — must contain `@tailwind base/components/utilities`
- [ ] `src/app/layout.tsx` — must `import './globals.css'`

After adding or changing any of the above, clear the build cache before restarting:

```bash
rm -rf apps/web/.next
pnpm --filter web dev
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS v3, shadcn/ui, React Hook Form + Zod |
| Backend | NestJS, Drizzle ORM, PostgreSQL |
| Auth | JWT + Google OAuth (Passport.js) |
| Monorepo | pnpm workspaces |

## Key Conventions

- Auth pages live at `apps/web/src/app/auth/<name>/page.tsx` (not a route group)
- Shared auth components: `apps/web/src/app/auth/_components/`
- Root `layout.tsx` renders `<Navbar>` — hide it on `/auth/*` via `usePathname()`
- API runs on port `3001`, web on port `3000`

## Role 模型（Phase A：一帳號全功能）

- DB `users.role` enum 仍是 `'surveyor' | 'respondent' | 'admin'`，但**只有 `admin` 在 code 裡真的有意義**。
- 所有 controller 已拆掉 `assertSurveyor` / `assertRespondent`，一般用戶（surveyor 或 respondent）能呼叫所有非 admin 端點。
- 註冊頁面沒有「選角色」流程，預設 role=`respondent`（純歷史遺留，無功能差別）。
- 前端 navbar 對非 admin 用戶一律渲染 3 個 tab：發問卷 / 填問卷 / 互惠。
- middleware 只擋未登入 + admin path（其他 cross-role 限制全部拆掉）。

## 互惠問卷模型（Phase B）

- `surveys.type` enum：`'standard' | 'mutual'` (預設 standard)
- 新表 `mutual_pairs`：FIFO 配對 + 72hr 超時
- `mutual_pairs.a_survey_id` partial UNIQUE（只對 active status 唯一，cancelled/expired/both_done 不佔位）
- 後端：`apps/api/src/mutual/` (controller / service / module)
- 前端：`apps/web/src/app/mutual/` (列表 + `[id]` 填答 + unlocked view) + `/admin/mutual` 管理頁
- 配對 cron：`MutualService.matchWaitingPairs()`（@Cron EVERY_30_SECONDS）
- 超時 cron：`MutualService.expireOverduePairs()`（@Cron EVERY_MINUTE）
- AI 品質審核接 `QualityAuditService.audit()` — 任一邊 finalScore < 50 → pair 自動 cancelled、對方那份問卷重新入池
- 停權檢查：`assertNotSuspended` 跟 standard 一致
- 解鎖（status=`both_done`）後 `GET /mutual/:id` 多回傳 `unlocked` block，內含「我這份問卷的題目 + 對方填的答案」
- 標準 `/tasks` 任務市場已過濾掉 mutual 問卷（mutual 走 `/mutual` 配對機制）

### Mutual API endpoints (`apps/api/src/mutual/`)

- `GET /mutual` — 我的所有互惠配對
- `GET /mutual/pool-stats` — 配對池規模 `{ waiting, myWaiting }`
- `GET /mutual/:id` — 配對詳情(含 unlocked block 當 both_done)
- `POST /mutual/:id/submit` — 提交對方問卷的填答(走 AI 審核)
- `POST /mutual/re-enqueue/:surveyId` — 把現有 mutual 問卷重新進池
- `GET /admin/mutual?status=` — admin 看所有 pair
- `POST /admin/mutual/:id/cancel` — admin 強制取消

### Mutual 測試

- service-level integration: `apps/api/src/mutual/mutual.integration.test.ts` (15 tests)
- admin mutual ops: `apps/api/src/admin/admin-mutual.integration.test.ts` (6 tests)
- E2E shell: `test-mutual.sh` (vault root) — 端到端跑 publish → 配對 → 雙方填寫 → unlocked

## 啟動指令備忘

```bash
docker compose up -d postgres redis    # 起 DB + Redis
cd apps/api && pnpm db:push            # 同步 schema (含 mutual)
pnpm db:seed                            # 灌 user/user1/user2 三帳號
pnpm --filter api dev                   # API @ :3001
pnpm --filter web dev                   # Web @ :3000
```

### 雙擊啟動（Windows，已驗證 2026-05-27）

日常啟動**直接雙擊 vault root 的 `start-quanwen.bat`** 即可，毋須先手動開 Docker。

- 流程（5 步）：偵測 Docker daemon → 沒開就自動啟動 Docker Desktop 並等最多 120s → `docker compose up postgres redis` → 等 Postgres healthy → `db:seed` → 開 **QuanWen API**（:3001）與 **QuanWen Web**（:3000）兩個視窗。
- 看到 Web 視窗出現 `✓ Ready`，即可開 http://localhost:3000。
- Dev 帳號（密碼皆 `000`）：`user@quanwen.com`(admin)/ `user1@quanwen.com` / `user2@quanwen.com`。
- 停止：雙擊 `stop-quanwen.bat` → 選 `[1]` 只關 API/Web（Docker 續跑、下次更快）或 `[2]` 連 Docker 一起關（資料仍保留在 volume）。

**這台機器的硬性約束（改 .bat 時務必遵守，否則雙擊會壞）：**

1. **.bat 一律純 ASCII**（英文訊息、0 個非 ASCII 位元組）。系統 ANSI 是 Big5(950)，雙擊時 cmd 以 950 起始逐行解析；檔內中文（UTF-8）會被拆碎成假指令，`chcp 65001` 救不回。
2. **路徑不寫死中文**，用 `set "REPO=%~dp0quanwen"`（`%~dp0` 取自檔案系統，與文字編碼無關）。寫死 `…\問券\…` 在 950 下會 `current directory is invalid`。
3. **pnpm 一律用 `pnpm.cmd`**：bat 內 `set "PNPM=%PNPM_DIR%\pnpm.cmd"`。裸 `pnpm` 會因 PATHEXT（.EXE 先於 .CMD）挑到這台壞掉的 `pnpm.exe`。
4. **巢狀引號**用 `start "Title" /D "%REPO%" cmd /k "set PATH=%NODE_DIR%;%%PATH%% && %PNPM% --filter api dev"`；別把 PowerShell 反引號跳脫 `` `" `` 漏進 .bat（批次檔裡反引號是字面字元，會讓 `cmd /k` 整條壞掉）。

> 驗證 .bat 安全：`[IO.File]::ReadAllBytes($p) | ? {$_ -gt 127}` 應為 0 筆。
