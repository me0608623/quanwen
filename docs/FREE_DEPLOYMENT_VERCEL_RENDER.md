# QuanWen 免費上線 Runbook（Vercel + Render）

這份文件只做一件事：把 `apps/web` 部署到 Vercel，把 `apps/api` 部署到 Render，並且把資料庫 / Redis / 回呼網址全接好。

推薦架構：

```text
Vercel (Next.js web)
  -> Render Web Service (NestJS API)
  -> Render PostgreSQL
  -> Render Redis
```

為什麼這套最好：
- Vercel 跑 Next.js 最順，少踩一堆 SSR 爛坑。
- Render 跑 Docker 化的 NestJS 很直接，health check 也好接。
- 前後端拆開後，問題定位比較乾淨，不會一坨屎一起炸。

## 0. 上線前硬條件

沒有這些，不要假裝自己在部署，你只是在製造事故：

- GitHub repo 已存在，且目前 code 可推上 remote
- Vercel 帳號可登入
- Render 帳號可登入
- 至少一組 production secrets 已生成
- 若要 OAuth：Google / LINE / Apple 的 production callback URL 可改
- 若要付款：ECPay production merchant credentials 已核發

## 1. 先生成 production secrets

在本機執行：

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # PII_ENCRYPTION_KEY
openssl rand -hex 16      # PII_KDF_SALT
```

最低標準：
- `JWT_SECRET`：至少 64 chars
- `PII_ENCRYPTION_KEY`：至少 32 bytes 等級亂數
- `PII_KDF_SALT`：16-byte hex

## 2. Render：先部署 API / Postgres / Redis

### 2.1 建立 PostgreSQL

在 Render 建立 PostgreSQL：
- Name: `quanwen-postgres`
- Database: `quanwen`
- User: `quanwen`
- Plan: Free / lowest available

記下外部連線字串：
- `DATABASE_URL`

### 2.2 建立 Redis

在 Render 建立 Redis：
- Name: `quanwen-redis`
- Plan: Free / lowest available

記下連線字串：
- `REDIS_URL`

### 2.3 先做一次 DB schema bootstrap

現在這個 repo 的 production Postgres 還沒全面切到 versioned migrations。
所以你如果拿一顆全新的 Render Postgres 直接上 API，服務也許能開，但真正打到資料表時會摔得像踩到樂高。

先在本機對那顆新 DB 跑一次：

```bash
cd /home/aa/projects/quanwen
export DATABASE_URL=postgresql://<render-user>:<render-password>@<render-host>:5432/quanwen
bash scripts/bootstrap-render-postgres.sh
```

這一步是「一次性空庫 bootstrap」，不是長期王道。長期還是得補齊 versioned migrations。

### 2.4 建立 API service

兩種做法都行，但我站 `render.yaml`：比較不會漏 env，也比較不會下次重建時失憶。

做法 A：Blueprint（推薦）
- 在 Render 選 Blueprint
- 指向 repo root
- 直接吃 `render.yaml`
- 建立後再把 `sync: false` 的 env secrets 一次補齊

做法 B：手動建立 Render Web Service
- Runtime: Docker
- Root directory: repo root
- Dockerfile path: `apps/api/Dockerfile`
- Docker build context: repo root
- Health check path: `/health`
- Plan: Free

Start command 不用填，Dockerfile 已有 `CMD ["node", "dist/main.js"]`。

### 2.4 API 環境變數

Render API service 至少要設這些：

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
WEB_URL=https://<your-vercel-domain>
# 若有 custom domain + vercel 預設 domain，同一欄可用逗號分隔
# WEB_URL=https://quanwen.tw,https://quanwen.vercel.app
JWT_SECRET=<generated>
PII_ENCRYPTION_KEY=<generated>
PII_KDF_SALT=<generated>
API_URL=https://<your-render-api-domain>
ENABLE_SWAGGER=0
```

建議再補：

```env
ZAI_API_KEY=
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
ZAI_MODEL=glm-5.1
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=QuanWen <noreply@quanwen.tw>
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
```

OAuth 若要開：

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://<your-render-api-domain>/api/v1/auth/google/callback
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_CALLBACK_URL=https://<your-render-api-domain>/api/v1/auth/line/callback
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APPLE_CALLBACK_URL=https://<your-render-api-domain>/api/v1/auth/apple/callback
```

ECPay 若要開：

```env
ECPAY_MERCHANT_ID=
ECPAY_HASH_KEY=
ECPAY_HASH_IV=
ECPAY_PAYMENT_URL=https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5
```

### 2.5 API 部署後驗證

把 `<api-domain>` 換成 Render 給的網址：

```bash
curl -i https://<api-domain>/health
curl -i https://<api-domain>/ready
curl -i https://<api-domain>/api/v1/tags
```

預期：
- `/health` -> 200
- `/ready` -> 200（DB / Redis 都成功）
- `/api/v1/tags` -> 200 或至少不是 5xx

若 `/ready` 失敗：
- `REDIS_URL` 沒設或壞了
- `DATABASE_URL` 壞了
- Render DB 還沒 ready

## 3. Vercel：部署 web

### 3.1 Import GitHub repo

在 Vercel：
- Import Git repository
- Framework: Next.js
- Root directory: repo root
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter web build`

不要把 root directory 指到 `apps/web`，這個 monorepo 還要吃 workspace root。亂改只會讓你在 shared package 上摔死。

### 3.2 Vercel 環境變數

至少要設：

```env
NEXT_PUBLIC_API_URL=https://<your-render-api-domain>/api/v1
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
```

如果 web 還有讀 server-side env，可同步補：

```env
NODE_ENV=production
```

### 3.3 Web 部署後驗證

```bash
curl -I https://<your-vercel-domain>
```

手動驗證：
- 首頁可開
- 註冊 / 登入頁可開
- 呼叫 API 不會打到 localhost
- OAuth 按鈕導向的是 production API domain

## 4. 部署順序

正確順序：

1. 先 Render DB
2. 再 Render Redis
3. 再 Render API
4. API health 通過後
5. 最後 Vercel web
6. 部署完成後更新 OAuth / ECPay callback

反過來做的話，前端先上線只會得到一個精美的白屏或 CORS 噴臉。沒必要演這齣。

## 5. 上線後一定要改的 callback / 白名單

### Google OAuth
- Authorized redirect URI:
  - `https://<api-domain>/api/v1/auth/google/callback`

### LINE OAuth
- Callback URL:
  - `https://<api-domain>/api/v1/auth/line/callback`

### Apple Sign In
- Return URL:
  - `https://<api-domain>/api/v1/auth/apple/callback`

### ECPay
- Server callback:
  - `https://<api-domain>/api/v1/wallet/ecpay/callback`

### API CORS
API 的 `WEB_URL` 必須是：
- `https://<vercel-domain>`

不要用 `*`。那不是方便，那是懶。

## 6. 上線 smoke test checklist

### API

```bash
curl -i https://<api-domain>/health
curl -i https://<api-domain>/ready
curl -i https://<api-domain>/api/v1/tags
```

### Web
- 首頁可載入
- 註冊成功
- 登入成功
- `/auth/*` 不被 navbar 干擾
- survey list / dashboard 不會因 API URL 指錯而炸掉

### Security
- `https://<api-domain>/docs` 應該不是開著的 production Swagger
- response headers 有 helmet
- 沒有 `.env` 被 commit
- `NEXT_PUBLIC_*` 沒塞私密金鑰

## 7. 已知免費方案限制

### Vercel Free
- 沒問題，前端首選
- 但如果大量 SSR / image optimization，很快會開始有額度感

### Render Free
- 服務可能 sleep
- 冷啟動慢
- 不適合拿來吹「高可用」
- 但拿來 demo、早期驗證、投資人能點開頁面，夠了

## 8. 現階段 blocker

以下事情沒有人類帳號 / 憑證就做不了：

- 真的按下 Vercel deploy
- 真的按下 Render deploy
- 綁 GitHub repo 到雲端
- 設 production secrets 到平台
- 設 OAuth provider callback
- 設 ECPay production callback

所以工程端能做的是：
- 確保 repo 有清楚 runbook
- 確保 build / startup / health path 都能對應到雲平台
- 把需要的人類操作縮到最少

這份文件就是幹這件事。
