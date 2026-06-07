# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run in two terminals)
pnpm --filter api dev        # NestJS API  → http://localhost:3001
pnpm --filter web dev        # Next.js Web → http://localhost:3000
pnpm dev                     # Both in parallel

# Build
pnpm build                   # Build all packages then all apps
pnpm --filter api build      # API only
pnpm --filter web build      # Web only

# Testing
pnpm test                    # All unit tests (Vitest)
pnpm --filter api test       # API unit/integration tests
pnpm --filter web test       # Web unit tests
pnpm --filter api test:watch # API tests in watch mode
pnpm --filter api test:coverage
pnpm --filter web test:e2e   # Playwright E2E (full browser)
pnpm --filter web test:e2e --headed  # Playwright with visible browser

# Run a single test file (unit)
pnpm --filter api test src/wallet/wallet.service.test.ts

# Run a single E2E spec (match by filename fragment)
pnpm --filter web test:e2e -- --grep "happy-path"
# Or pass the spec file directly:
cd apps/web && npx playwright test e2e/happy-path-qua11.spec.ts

# Static analysis
pnpm lint                    # ESLint across all apps
pnpm type-check              # tsc --noEmit across all apps
pnpm verify                  # type-check + test

# Database (requires USE_PG_MEM=false + valid DATABASE_URL)
pnpm db:push                 # Sync Drizzle schema → DB (dev)
pnpm db:seed                 # Seed 3 test users
pnpm db:studio               # Drizzle Studio GUI
pnpm --filter api db:generate  # Generate migration files
pnpm --filter api db:reset     # Wipe + re-seed
```

**Test accounts** (password `000` for all): `user@quanwen.com` (admin → `/admin`), `user1@quanwen.com` (surveyor → `/dashboard`), `user2@quanwen.com` (respondent → `/dashboard`).

**E2E aliases** in `apps/web/e2e/helpers/auth.ts`: `aa`=user2, `bb`=user1, `cc`=admin. Use `login(page, 'aa')` in specs.

**Windows double-click launch**: `start-quanwen.bat` (vault root) auto-starts Docker, waits for Postgres, seeds, then opens two terminal windows for API and Web. `stop-quanwen.bat` shuts them down.

## Architecture

**Monorepo** (`pnpm` workspaces):
- `apps/api` — NestJS 10, port 3001. All business logic.
- `apps/web` — Next.js 14 App Router, port 3000. Frontend.
- `packages/shared-types` — TypeScript types shared by both apps. When a type must be consumed by both `api` and `web`, define it here and import as `@quanwen/shared-types`. Do not duplicate type definitions across apps.
- `packages/report-generator` — Internal HTML report engine (adapted from nexu-io/html-anything). Used by `ExportService`. Modifiable — it's our code.

### API Module Map

Every feature is a NestJS module: `auth`, `profile`, `tags`, `surveys`, `responses`, `mutual`, `wallet`, `notifications`, `admin`, `ai-audit`, `mail`, `kyc`, `point-shop`, `spin`, `appeals`, `export`, `reconciliation`.

Pattern inside each module: `controller → service → Drizzle ORM → DB`.

Key cross-cutting modules:
- `db/` — `@Global()` `DatabaseModule` exports a single `AppDb` (Drizzle) token. All services inject `@Inject(DB) private db: AppDb`.
- `ai-audit/` — `ZaiClient` wraps Z.ai GLM-5.1. Used by `SurveysService` (AI draft + async quality audit) and `MutualService` (response quality gate).
- `common/pipes/zod-validation.pipe.ts` — Applied globally. DTOs use Zod schemas, not class-validator.
- `common/filters/http-exception.filter.ts` — Global exception filter; standardises error shape.
- `appeals/` — Respondent appeal flow for rejected responses; creates `appeals` rows and notifies admin.
- `export/` — Survey result export in PDF, Excel (buffered + streaming), CSV (streaming, 500-row keyset batches), and Markdown. Text answers pass through `redactPii()` before export.
- `reconciliation/` — `ReconciliationService` cross-checks ECPay payment callbacks against internal `transactions` records to detect discrepancies.

### Database Modes

| Mode | How to enable | Notes |
|------|--------------|-------|
| PGlite (in-memory) | `USE_PG_MEM=true` | Fastest; data lost on restart; auto-runs DDL on startup |
| Real PostgreSQL | `USE_PG_MEM=false` + `DATABASE_URL` | Requires `pnpm db:push` after schema changes |

`DatabaseModule` detects `USE_PG_MEM` and provides either a PGlite or `pg` Pool driver to Drizzle. All schema DDL is also inlined into the PGlite `useFactory` (`apps/api/src/db/database.module.ts`) so `db:push` is not needed in memory mode.

**Critical**: When adding new tables or columns to the Drizzle schema files, you **must** update **two** additional files or tests will fail:
1. `apps/api/src/db/database.module.ts` — the PGlite `useFactory` DDL block (for `USE_PG_MEM=true` dev/CI bootstrap).
2. `apps/api/src/test-helpers/pglite-ddl.ts` — the canonical `FULL_SCHEMA_DDL` used by all integration tests.

Forgetting either causes silent schema drift: `USE_PG_MEM=true` starts with a stale schema, and integration tests fail with "column X does not exist".

### Web Architecture

- Next.js App Router — all pages under `src/app/`.
- API calls go through `src/lib/api.ts` (axios instance, auto-attaches Bearer token from localStorage).
- Server state via TanStack Query hooks in `src/hooks/use-*.ts`. Each domain has its own hook file (`use-auth`, `use-surveys`, `use-wallet`, etc.).
- Zustand is used for lightweight client-only state (e.g. `behavior-tracker`).
- Auth pages live at `/auth/<name>/page.tsx` — **not** a route group. Navbar hides itself on `/auth/*` via `usePathname()`.

### One Account, Both Roles (Phase A)

Every new user — whether email/password or OAuth — gets **both** a `respondent_profiles` row and a `surveyor_profiles` row created immediately via `ensureBothProfiles()` in `AuthService`. This is called on `register()` and inside `findOrCreateOAuthUser()`.

This means the `users.role` column is **not** used to gate surveyor vs respondent features; it only distinguishes `admin` from regular users. Do not add `role === 'surveyor'` guards for feature access — check the profile's `isOnboardingDone` flag instead.

### Auth Flow

JWT-based. `passport-jwt` validates `Authorization: Bearer <token>` on all `@UseGuards(JwtAuthGuard)` routes. Token is stored in `localStorage` on the frontend and auto-attached by the axios instance.

OAuth (Google, LINE, Apple) implemented without Passport strategies for LINE/Apple — raw `fetch` + `jose` for JWT verification. New OAuth users land on `/auth/select-role` before onboarding.

**OAuth account linking security rule**: `findOrCreateOAuthUser()` does **not** auto-link an OAuth login to an existing email-matching account. A new user record is always created (with a fallback `@oauth.quanwen.local` email if there's a collision). Users who want to merge accounts must log in with the existing account first and bind the provider from Settings → Account. This prevents OAuth accounts from silently gaining access to existing accounts (including admin accounts).

**OAuth binding flow**: `GET /auth/bind/:provider` (requires JWT) creates a short-lived in-memory bind session (10-minute TTL) keyed by a CSPRNG token, then redirects to the provider. The callback resolves the session and links the provider to the existing user.

**Password policy** (enforced in `AuthController.validatePasswordPolicy`): ≥8 chars, ≤72 chars, at least one uppercase letter, at least one digit.

**Token refresh**: `POST /auth/refresh` (requires valid JWT) re-signs a fresh 7-day token without re-authenticating. The frontend should call this before the token expires.

### Response Quality Audit Pipeline

Three layers run sequentially on every submitted response:

1. **Layer 1 — Anti-Cheat** (`AntiCheatService`): deterministic heuristics (fill duration, duplicate detection, suspicious flags). Score 0-100.
2. **Layer 2 — Behavioral scoring** (`QualityAuditService`): weighted signals — behavior (25%), attention check (20%), reverse-consistency (15%), text relevance (15%), AI-detection (10%), reputation (10%), timing (5%).
3. **Layer 3 — LLM judge** (`ZaiClient` GLM-5.1): only triggered for gray-zone responses (50-79). Produces `llmScore` + `llmReasoning`.

Final `qualityScore` thresholds: **≥80 = passed** (auto-reward), **50-79 = suspicious** (may trigger LLM), **<50 = rejected** (no reward). Full breakdown stored in `surveyResponses.qualityBreakdown` (JSONB).

`ReputationService` maintains a rolling reputation score per respondent based on their quality history.

### Mutual Survey Flow

1. Surveyor publishes a `type='mutual'` survey → enters FIFO waiting pool.
2. Cron `matchWaitingPairs()` (every 30s) creates a `mutual_pairs` row linking two surveys.
3. Each participant fills the other's survey. `AntiCheatService` + `ZaiClient` quality gate runs on submit.
4. If either side scores < 50 → pair auto-cancelled, survey re-enqueued.
5. When `status='both_done'` → `GET /mutual/:id` returns `unlocked` block with peer's answers.
6. Pairs expire after 72 hours (`expireOverduePairs()` cron, every minute).

Standard `/tasks` marketplace filters out `type='mutual'` surveys.

### Wallet / Finance

All monetary amounts are stored as **integers in New Taiwan Dollars (NT$)**. Never use floats.

Double-entry accounting: every `WalletService` mutation creates both a `transactions` record and two `journal_entries` (debit + credit). Survey publication locks budget (`lockedCash`); survey close releases unused budget back to `cashBalance`. Platform takes **10%** fee on each reward payout (`PLATFORM_FEE_RATE = 0.10`，2026-06-07 由 15% 調降).

ECPay deposit limits: NT$100–NT$100,000 per transaction. Withdrawal limits: NT$300 minimum, NT$30,000 maximum per day. KYC verification is required before withdrawal.

Reconciliation runs via `ReconciliationService` to cross-check ECPay callbacks against internal transaction records.

### Export Formats

`ExportService` (`apps/api/src/responses/export.service.ts`) supports four formats for survey creators:
- **PDF** — stats summary via `pdfmake` (non-streaming; demo uses standard 14 fonts; prod needs Noto Sans TC embed for Chinese).
- **Excel (buffered)** — `exceljs`, two sheets: Responses + Summary. Suitable for smaller datasets.
- **CSV (streaming)** — keyset-cursor pagination in batches of 500, constant memory. UTF-8 BOM prepended for Excel compatibility.
- **Excel (streaming)** — `exceljs` streaming WorkbookWriter, same keyset approach.
- **Markdown** — aggregated stats report.

Text-type answers (`text`, `matrix`) are passed through `redactPii()` before export. `cleanOnly` mode filters responses below a configurable `minQualityScore` (default 70).

## Key Rules

```
❌ Store amounts as float         ✅ Integer NT$ only
❌ String-concatenate SQL         ✅ Drizzle parameterised queries
❌ Skip Zod on req.body           ✅ ZodValidationPipe is global — always define a DTO
❌ Log tokens / secrets           ✅ logger.info + redact sensitive fields
❌ Hardcode API keys              ✅ process.env, validated at startup
❌ Call respondent wallet "儲值"   ✅ "待領獎勵" / "我的收益"
❌ Self-collect payments          ✅ ECPay (綠界) payment gateway only
❌ Send PII to Z.ai               ✅ De-identify before any AI call
❌ Platform fee = 15%（舊值）      ✅ PLATFORM_FEE_RATE = 0.10 (10%，2026-06-07 起)
❌ Auto-link OAuth by email       ✅ Always create new user; explicit binding via /settings/accounts
❌ Add schema without DDL sync    ✅ Update both schema/*.ts AND database.module.ts PGlite block
❌ role guard for feature access  ✅ Check profile.isOnboardingDone; all users have both profiles
❌ Store PII in plaintext          ✅ Use CryptoService.encrypt for ID numbers, bank accounts, phone, real names
❌ Public endpoints by default     ✅ New endpoints require JWT; use @Public() decorator only for explicit public routes
❌ Missing journal entry           ✅ All WalletService mutations create two journal_entries (debit + credit)
```

## Pull Request Workflow

Before creating a PR, verify the **紅線 checklist** (red lines):

- [ ] **金流**: 所有金額用 integer NT$ 元，無 float
- [ ] **金流**: 所有 transaction 雙向 journal entry（debit = credit）
- [ ] **個資**: 身分證 / 銀行帳號 / 手機 / 真實姓名走 `CryptoService.encrypt` (AES-256-GCM)
- [ ] **API**: 所有輸入用 Zod schema validate
- [ ] **SQL**: 用 Drizzle parameterized query，沒拼字串
- [ ] **Auth**: 新端點預設要 JWT；明確 `@Public()` 才公開

**AI/LLM changes** (if modifying `ai-audit/prompts.ts` or `ai-audit/schemas.ts`):
- [ ] 動到 prompt 文字 → 對應 `PromptEntry.version` 已 bump
- [ ] 新增 prompt entry → `key` 用 `領域.用途` 格式
- [ ] 動到 Zod schema → caller 端有對應 fallback

**Test plan**:
- [ ] `pnpm type-check` passes
- [ ] `pnpm test` passes (Vitest)
- [ ] For UI changes: run affected Playwright specs
- [ ] Manual smoke test of affected flows

## Tailwind Setup Checklist

If styles are missing, verify all four files exist in `apps/web/`:
1. `postcss.config.mjs` — required for `@tailwind` directives to compile
2. `tailwind.config.ts` — `content` must cover `./src/app/**` and `./src/components/**`
3. `src/app/globals.css` — must include `@tailwind base/components/utilities`
4. `src/app/layout.tsx` — must `import './globals.css'`

After changes: `rm -rf apps/web/.next && pnpm --filter web dev`

## Windows .bat Constraints

The double-click launch scripts (`start-quanwen.bat`, `stop-quanwen.bat`) must follow these rules or they break on this machine (system ANSI = Big5/950):

1. **Pure ASCII only** — no Chinese characters in .bat files. Verify: `[IO.File]::ReadAllBytes($p) | ? {$_ -gt 127}` should return 0 results.
2. **Use `%~dp0` for paths** — never hardcode Chinese directory names. `set "REPO=%~dp0quanwen"` resolves correctly regardless of encoding.
3. **Use `pnpm.cmd` not `pnpm`** — `set "PNPM=%PNPM_DIR%\pnpm.cmd"`. Bare `pnpm` picks up a broken `pnpm.exe` due to PATHEXT ordering.
4. **Nested quotes in `start` commands** — use `start "Title" /D "%REPO%" cmd /k "..."`. No PowerShell backtick escapes inside .bat.

## Environment Variables

Minimum required for dev (see `.env.example` for full list):

| Variable | Required | Notes |
|----------|----------|-------|
| `USE_PG_MEM` | dev | `true` = PGlite in-memory (no Docker needed) |
| `DATABASE_URL` | prod | PostgreSQL connection string |
| `JWT_SECRET` | always | ≥ 64 chars |
| `PII_ENCRYPTION_KEY` | prod | AES key for encrypting PII at rest; generate with `openssl rand -hex 32` |
| `PII_KDF_SALT` | prod | KDF salt; generate with `openssl rand -hex 16` |
| `ZAI_API_KEY` | AI features | Format: `xxx.yyy` from Z.ai dashboard |
| `WEB_URL` | CORS | Default: `http://localhost:3000` |
| `API_URL` | frontend | Default: `http://localhost:3001/api/v1` |
| `ENABLE_SWAGGER` | dev/staging | Set to `true` to expose `/docs` (Swagger UI) |
| `LINE_CHANNEL_ID` | LINE OAuth | Channel ID from LINE Developers console (not `LINE_CLIENT_ID`) |
| `LINE_CHANNEL_SECRET` | LINE OAuth | Channel Secret (not `LINE_CLIENT_SECRET`) |
| `LINE_CALLBACK_URL` | LINE OAuth | `http://localhost:3001/api/v1/auth/line/callback` |

Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`), Apple (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CALLBACK_URL`), and ECPay (`ECPAY_*`) vars are optional for local dev but required for production. See `README.md` for the complete variable table.

## Further Reading

- `README.md` — full DB schema, all API endpoints, sprint history, ADR decisions.
- `DEPLOYMENT.md` — production environment variables, ECPay sandbox setup.
- `http://localhost:3001/docs` — Swagger UI (requires `ENABLE_SWAGGER=true` and running API).

---

## Docker Hub Build & Push（Ubuntu 24.04）

> **給 Claude Code 的指示**：在 Ubuntu 上執行時，依照以下步驟安裝環境、build 並 push image 到 Docker Hub。
> Docker Hub 帳號：`me0608623`，專案名稱：`quanwen-api` / `quanwen-web`。

---

### 環境安裝（全新 Ubuntu 24.04 必做，已安裝可跳過）

#### 1. 系統套件

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential ca-certificates gnupg lsb-release
```

#### 2. Docker Engine

```bash
# 加入 Docker 官方 GPG key 與 repository
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安裝
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 讓目前使用者不需要 sudo 跑 docker
sudo usermod -aG docker $USER
newgrp docker

# 開機自動啟動
sudo systemctl enable docker && sudo systemctl start docker

# 驗證
docker --version          # Docker version 26.x.x
docker compose version    # Docker Compose version v2.x.x
docker run --rm hello-world
```

#### 3. Node.js 22（via nvm）

```bash
# 安裝 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 安裝 Node.js 22 LTS
nvm install 22
nvm use 22
nvm alias default 22

# 驗證
node --version   # v22.x.x
```

#### 4. pnpm 11（via corepack）

```bash
corepack enable
corepack prepare pnpm@11.4.0 --activate

# 驗證
pnpm --version   # 11.4.0
```

#### 5. 確認所有工具就緒

```bash
docker --version && docker compose version && node --version && pnpm --version && git --version
# 預期：Docker 26+, Compose v2+, Node v22+, pnpm 11.4.0, git 2.x
```

---

### 前置確認（已安裝環境用此快速驗證）

```bash
docker run --rm hello-world   # Docker 可用且不需要 sudo
node --version                # v22.x.x
pnpm --version                # 11.x.x
```

### Step 1：取得最新 source code

```bash
# 若尚未 clone
git clone git@github.com:me0608623/quanwen.git
cd quanwen

# 若已 clone，更新到最新
git fetch origin
git checkout chore/scale-out-p1-p4
git pull
```

### Step 2：安裝依賴

```bash
pnpm install
```

### Step 3：登入 Docker Hub

```bash
docker login
# 輸入 Docker Hub username: me0608623
# 輸入 password 或 access token
```

### Step 4：Build + Push API image

```bash
# Build（Ubuntu 網路正常，直接用標準 Dockerfile）
docker compose -f docker-compose.yml -f docker-compose.full.yml build api

# 確認 image 存在
docker images | grep quanwen-api

# Tag
docker tag quanwen-api:latest me0608623/quanwen-api:latest
docker tag quanwen-api:latest me0608623/quanwen-api:v0.1.0

# Push
docker push me0608623/quanwen-api:latest
docker push me0608623/quanwen-api:v0.1.0
```

### Step 5：Build + Push Web image

> Ubuntu 網路正常，可以連 `fonts.gstatic.com`，使用標準 Dockerfile 即可。

```bash
# Build web image（會下載 Google Fonts，需要網路，約 3-5 分鐘）
docker compose -f docker-compose.yml -f docker-compose.full.yml build web

# 確認 image 存在
docker images | grep quanwen-web

# Tag
docker tag quanwen-web:latest me0608623/quanwen-web:latest
docker tag quanwen-web:latest me0608623/quanwen-web:v0.1.0

# Push
docker push me0608623/quanwen-web:latest
docker push me0608623/quanwen-web:v0.1.0
```

### Step 6：驗證 Docker Hub 上的 image

```bash
# Pull 並測試（可選）
docker pull me0608623/quanwen-api:latest
docker pull me0608623/quanwen-web:latest

# 確認 image 大小正常
docker images | grep me0608623
# 預期：quanwen-api ~780MB，quanwen-web ~300MB
```

### Step 7：一鍵啟動完整 stack 驗證（可選）

```bash
# 建立 .env（最小設定，僅供驗證）
cat > /tmp/quanwen-test.env << 'EOF'
DOCKERHUB_USERNAME=me0608623
APP_VERSION=latest
JWT_SECRET=$(openssl rand -base64 48)
PII_ENCRYPTION_KEY=$(openssl rand -hex 32)
WEB_URL=http://localhost:3000
EOF

# 用 docker-compose.hub.yml 啟動（從 Docker Hub pull）
cp /tmp/quanwen-test.env .env
docker compose -f docker-compose.hub.yml up -d

# 等待啟動（約 30 秒）
sleep 30

# 驗證 API
curl -s http://localhost:3001/api/v1/health

# 驗證 Web
curl -sI http://localhost:3000 | head -1

# 停止
docker compose -f docker-compose.hub.yml down
```

### 常見錯誤

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `permission denied` | Docker 未加入群組 | `sudo usermod -aG docker $USER && newgrp docker` |
| `unauthorized` | 未登入或 token 過期 | `docker login` |
| fonts.gstatic.com 下載失敗 | 網路問題（通常 Ubuntu 不會出現） | 確認 `curl https://fonts.gstatic.com/` 可連 |
| `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` | pnpm 版本太舊 | `corepack prepare pnpm@11.4.0 --activate` |
| Web image build 失敗（standalone） | Linux 上不會有 EPERM | 若出現其他錯誤，`rm -rf apps/web/.next && pnpm --filter web build` |

### Windows vs Ubuntu build 差異說明

| 項目 | Windows Docker Desktop | Ubuntu Docker Engine |
|------|----------------------|---------------------|
| API build | ✅ 標準 `docker compose build api` | ✅ 相同 |
| Web build | ⚠️ 需用 `Dockerfile.prebuilt`（Docker 封鎖 Google CDN） | ✅ 標準 `docker compose build web` |
| Google Fonts 下載 | 只能在 Windows host 上下載 | ✅ 直接在 Docker 內下載 |
| standalone EPERM | ⚠️ 需先刪 `.next/standalone` | ✅ 無此問題 |

---

## Ubuntu 上 Pull Image 並啟動服務

> **給 Claude Code 的指示**：不需要 source code，直接從 Docker Hub pull image 啟動完整服務。
> 適用情境：生產伺服器、新機器、只想跑服務不想 build。

### Step 1：安裝 Docker Engine（若未安裝）

```bash
# 快速安裝 Docker Engine（Ubuntu 24.04）
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# 驗證
docker run --rm hello-world
```

### Step 2：取得 docker-compose.hub.yml

```bash
mkdir -p ~/quanwen && cd ~/quanwen

# 方法 A：從 GitHub 直接下載（不需要 clone 整個 repo）
curl -fsSL https://raw.githubusercontent.com/me0608623/quanwen/chore/scale-out-p1-p4/docker-compose.hub.yml \
  -o docker-compose.hub.yml

# 方法 B：若已有 git clone
# cp /path/to/quanwen/docker-compose.hub.yml ~/quanwen/
```

### Step 3：建立 .env

```bash
cd ~/quanwen

# 產生 secrets
JWT_SECRET=$(openssl rand -base64 48)
PII_KEY=$(openssl rand -hex 32)

cat > .env << EOF
DOCKERHUB_USERNAME=me0608623
APP_VERSION=latest
JWT_SECRET=${JWT_SECRET}
PII_ENCRYPTION_KEY=${PII_KEY}
WEB_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
EOF

echo ".env 建立完成，內容："
cat .env
```

### Step 4：Pull image 並啟動

```bash
cd ~/quanwen

# Pull 所有 image（postgres + redis 從 Docker Hub 官方 pull，api + web 從 me0608623）
docker compose -f docker-compose.hub.yml pull

# 確認 image 已下載
docker images | grep -E "me0608623|pgvector|redis"

# 啟動全部服務（背景執行）
docker compose -f docker-compose.hub.yml up -d
```

### Step 5：確認服務狀態

```bash
# 查看所有容器狀態（等待 postgres/redis healthy 再繼續）
docker compose -f docker-compose.hub.yml ps

# 等待 postgres healthy（最多 60 秒）
until docker inspect --format='{{.State.Health.Status}}' quanwen_postgres 2>/dev/null | grep -q "healthy"; do
  echo "等待 Postgres..."; sleep 3
done
echo "Postgres ready"

# 驗證 API
curl -s http://localhost:3001/api/v1/health
# 預期：{"status":"ok"} 或類似

# 驗證 Web
curl -sI http://localhost:3000 | head -1
# 預期：HTTP/1.1 200 OK
```

| 服務 | URL |
|------|-----|
| Web 前端 | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/docs（需 `ENABLE_SWAGGER=true`） |

### Step 6：更新版本

```bash
cd ~/quanwen

# 修改 .env 中的版本號
sed -i 's/APP_VERSION=.*/APP_VERSION=v0.1.0/' .env

# Pull 新版本 + 重啟（api/web 會更新，postgres/redis 不重啟）
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d

# 確認新版本在跑
docker compose -f docker-compose.hub.yml ps
```

### Step 7：停止服務

```bash
cd ~/quanwen

# 停止容器（保留資料 volume）
docker compose -f docker-compose.hub.yml down

# 停止並刪除資料（⚠️ 資料庫資料會消失）
# docker compose -f docker-compose.hub.yml down -v
```

### Pull 常見錯誤

| 錯誤 | 原因 | 解法 |
|------|------|------|
| `permission denied` | Docker 未加入群組 | `sudo usermod -aG docker $USER && newgrp docker` |
| `pull access denied` | image 不存在或 private | 確認 `me0608623/quanwen-api` 是 public |
| `unauthorized` | Private repo 未登入 | `docker login` |
| API 啟動後 crash | `.env` 缺少必要變數 | 確認 `JWT_SECRET` 和 `PII_ENCRYPTION_KEY` 已設定 |
| `port is already allocated` | 端口被佔用 | `sudo lsof -i :3000` 找出佔用程序並 kill |
| Postgres unhealthy | 容器啟動太慢 | 等待 30 秒後再試 `docker compose ps` |

## 本地測試帳號（dev only）

- `user1@quanwen.com` / 密碼 `000` — 用於登入 `/dashboard/*` 驗證 UI。
- 僅限本地 docker dev 環境；勿用於生產。
- ⚠️ 這些 `000` 測試帳號已於 2026-06-06 從**正式 Neon DB 刪除**（安全）。正式站 admin = `me0608623@gmail.com`（Google 登入）。本機 docker DB 仍保留供開發。

---

# 正式環境部署（LIVE，2026-06-06 起）

> 給其他 session：正式站不再是「本機 Docker + Cloudflare tunnel」，已遷移到雲端、不依賴開發機。

## ⚠️ 改完代碼必須部署（強制）

**本機改 code ≠ 正式站更新。** 每次代碼改動完成並驗證後，依改動範圍部署，否則使用者在公開網站看不到變化：

| 改了什麼 | 要部署到 | 指令 |
|----------|---------|------|
| `apps/web`（前端/首頁/UI） | **Vercel** | `cd /home/aa/projects/quanwen && vercel --prod --yes --scope 409500476s-projects` |
| `apps/api`（後端/API） | **Render**（經 Docker Hub） | 見下方「更新正式 API」三步驟 |
| `packages/*`（共用） | **兩邊都要** | 先 API 再前端 |
| DB schema | **Neon** | `cd apps/api && DATABASE_URL=$NEON_DATABASE_URL npx drizzle-kit push` |

- 流程順序：`pnpm verify` 全綠 → `git commit` → 部署（先 commit 正式站才有 git 對應可回溯）。
- Vercel 部署是上傳**整個本地 working tree**（未 commit 的改動也會上線）；docker build 也吃 working tree。
  若工作樹混有其他 session 的半成品 → **從乾淨 worktree 部署**：
  `git worktree add /tmp/quanwen-deploy HEAD && cp -r .vercel /tmp/quanwen-deploy/`，
  從那裡 docker build / `vercel --prod`，完事 `git worktree remove --force /tmp/quanwen-deploy`。
- 部署後驗證：前端 `curl -sI https://quanwen.vercel.app | head -1`；API `curl -s https://quanwen-api.onrender.com/health`
  （⚠️ health 在**根路徑** `/health`，不是 `/api/v1/health` — 後者 404。冷啟動可能要等 30-60s）。
- Render redeploy 用 API 觸發後，可 poll `GET /v1/services/$RENDER_SERVICE_ID/deploys/<dep-id>` 直到 `"status":"live"` 再驗證。

## 架構

| 層 | 服務 | 位置 |
|----|------|------|
| 前端 | Vercel | https://quanwen.vercel.app |
| API | Render（free, Singapore） | https://quanwen-api.onrender.com |
| DB | Neon serverless Postgres | ap-southeast-1 |
| Redis | 無（Throttler 自動降級 in-memory） | — |

- Render free 閒置 ~15 分鐘休眠，首個請求冷啟動 ~30-60s。
- 憑證/IDs：Render service `srv-d8hsdilckfvc73b4r8a0`、owner `tea-d8hrrvb7uimc73a3us9g`；Vercel project `quanwen`（`prj_zBNngjpM7PiVTZj4c7a2EWn8o1Ph`）、team scope `409500476s-projects`。

### 🔑 密鑰存取（其他 session 用這個）

> 切勿把金鑰明文寫進本檔（會進 git）。金鑰存在 **repo 外**的 `chmod 600` 私密檔。

```bash
source /home/aa/.config/quanwen/secrets.env
# 之後可用：$RENDER_API_KEY、$RENDER_SERVICE_ID、$NEON_DATABASE_URL
# 範例：觸發 Render 重部署
curl -s -X POST "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}'
```
- Vercel token 不在此檔，`vercel` CLI 會自動讀 `/home/aa/.local/share/com.vercel.cli/auth.json`（部署用 `vercel --prod --yes --scope 409500476s-projects`）。
- 私密檔內容：`RENDER_API_KEY`、`RENDER_SERVICE_ID`、`NEON_DATABASE_URL`。

## 更新正式 API（程式碼改動後）

Render 跑的是 **Docker Hub image**（repo 是 private、未連 git），不是 git build：
```bash
cd /home/aa/projects/quanwen
docker compose -f docker-compose.yml -f docker-compose.full.yml build api
docker tag quanwen-api:latest me0608623/quanwen-api:latest
docker push me0608623/quanwen-api:latest
# 觸發 Render 重部署
curl -s -X POST "https://api.render.com/v1/services/srv-d8hsdilckfvc73b4r8a0/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}'
```
（Docker Hub 登入：`config.json` 的 `credsStore` 要移除才能存 inline 憑證；`docker login -u me0608623`。）

## 更新正式前端

Vercel 專案**沒連 git**，只能從 **repo 根**用 CLI 部署（從 `apps/web` 跑會連錯專案 + frozen-lockfile 失敗）：
```bash
cd /home/aa/projects/quanwen
vercel --prod --yes --scope 409500476s-projects --token="$VERCEL_TOKEN"
```
- 專案設定 `rootDirectory=apps/web`、`installCommand=cd ../.. && pnpm install --no-frozen-lockfile`。
- `NEXT_PUBLIC_*` 是 build-time 烘進去的 → 改 env 後**必須重部署**。

## Neon DB 操作

```bash
# schema 同步（db:push 腳本用舊的 push:pg 會 no-op，要用新版）
cd apps/api && DATABASE_URL='<neon-url>' npx drizzle-kit push
# 從本機 docker 搬資料到 Neon（會清空 Neon schema 重灌）
docker exec quanwen_postgres bash -c "psql '<neon>' -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' && pg_dump -U quanwen -d quanwen_dev --no-owner --no-privileges | psql '<neon>'"
```
- ⚠️ `docker exec` 跑 heredoc/stdin SQL 要加 `-i`，否則 stdin 不進容器、靜默 no-op。

## CORS

- API CORS allowlist = `WEB_URL`（+ `CORS_ORIGINS`），精確比對 origin（`main.ts`）。
- Render 的 `WEB_URL` 必須含正式前端：`https://quanwen.vercel.app`。

## 第三方登入（OAuth）

由 `NEXT_PUBLIC_OAUTH_PROVIDERS`（Vercel env，逗號分隔）控制前端顯示哪些按鈕；目前 = `google,line`（Apple 隱藏）。

| Provider | 狀態 | callback URL | 後端 env |
|----------|------|-------------|---------|
| Google | ✅ 啟用 | `https://quanwen-api.onrender.com/api/v1/auth/google/callback` | `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` |
| LINE | ✅ 啟用 | `https://quanwen-api.onrender.com/api/v1/auth/line/callback` | `LINE_CHANNEL_ID/SECRET`、`LINE_CALLBACK_URL` |
| Apple | ⏸️ 隱藏（無付費帳號） | `https://quanwen-api.onrender.com/api/v1/auth/apple/callback`（POST） | `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY/CALLBACK_URL` |

- ⚠️ **Google/LINE 的 passport/strategy 啟動時若 clientID 為空會 crash**（`OAuth2Strategy requires a clientID option`）。未啟用的 provider 要給**非空 placeholder**（如 `placeholder_disabled`）才不會讓 API boot 失敗。LINE/Apple 走 raw fetch、不會 boot crash。
- 設定/更新 OAuth：PUT `https://api.render.com/v1/services/<svc>/env-vars/<KEY>`（body `{"value":...}`）→ POST `/deploys`；前端按鈕 → 改 Vercel `NEXT_PUBLIC_OAUTH_PROVIDERS` + 重部署。

## 訂閱定價（VIP/VVIP）成本基準

定價邏輯應以**實際 AI API 成本**為基礎。資料來源 `zai_call_log`（記每次 prompt/completion/total tokens）。

- 模型 `glm-5.1`，實測平均一次調用 ≈ **1852 input + 599 output ≈ 2451 tokens**。
- Z.ai 單價（USD/1M tokens）：glm-5.1 `$1.4 in / $4.4 out`；glm-4.6 `$0.6/$2.2`；glm-4.5-air `$0.2/$1.1`；glm-4.5-flash / 4.7-flash **免費**。
- 每次調用成本（glm-5.1）≈ **$0.0052 ≈ NT$0.17**。
- 方案在 `apps/api/src/profile/user-subscription.service.ts` 的 `PLAN_CONFIG`：Free（3 次/日, NT$0）、VIP（50 次/日, NT$890）、VVIP（無限, NT$1990）。
- VIP 月成本上限（1500 次/月 × $0.0052）≈ **NT$251**（glm-5.1，全用滿時）。最大省錢槓桿 = **改用較便宜模型或 Flash 做例行調用**。
