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

Double-entry accounting: every `WalletService` mutation creates both a `transactions` record and two `journal_entries` (debit + credit). Survey publication locks budget (`lockedCash`); survey close releases unused budget back to `cashBalance`. Platform takes **15%** fee on each reward payout (`PLATFORM_FEE_RATE = 0.15`).

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
❌ Store amounts as float      ✅ Integer NT$ only
❌ String-concatenate SQL      ✅ Drizzle parameterised queries
❌ Skip Zod on req.body        ✅ ZodValidationPipe is global — always define a DTO
❌ Log tokens / secrets        ✅ logger.info + redact sensitive fields
❌ Hardcode API keys            ✅ process.env, validated at startup
❌ Call respondent wallet "儲值" ✅ "待領獎勵" / "我的收益"
❌ Self-collect payments        ✅ ECPay (綠界) payment gateway only
❌ Send PII to Z.ai             ✅ De-identify before any AI call
❌ Platform fee = 10%           ✅ PLATFORM_FEE_RATE = 0.15 (15%)
❌ Auto-link OAuth by email     ✅ Always create new user; explicit binding via /settings/accounts
❌ Add schema without DDL sync  ✅ Update both schema/*.ts AND database.module.ts PGlite block
❌ role guard for feature access ✅ Check profile.isOnboardingDone; all users have both profiles
```

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
