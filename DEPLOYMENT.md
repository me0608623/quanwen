# Deployment Runbook — 券問 QuanWen

Phase O：把整套 demo-ready system 推上線需要的步驟。

---

## 1. 環境變數（critical）

### prod 必設（缺啟動失敗）

| Key | 為什麼 |
|-----|--------|
| `NODE_ENV=production` | 啟動嚴格 env 檢查、helmet CSP、關 Swagger |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | ≥ 32 chars 隨機字串；簽 access token 用 |
| `PII_ENCRYPTION_KEY` | 任意長度隨機字串；AES-256-GCM 加密身分證 / 銀行帳號 |
| `WEB_URL` | 前端網址，CORS 白名單與 OAuth callback 用 |
| `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` | 綠界商家驗證 + CheckMacValue 驗簽 |

### prod 強烈建議

| Key | 為什麼 |
|-----|--------|
| `PII_KDF_SALT` | 16-byte hex 隨機；讓 scrypt KDF 不再用 default salt |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | 沒這個 prod 出 bug 看不到 stack trace |
| `SMTP_HOST/USER/PASS/PORT` | 通知 email + 忘記密碼信寄送 |
| `ZAI_API_KEY` | AI 品質審核 / 反作弊 / 預審若 fail-open 會降級為純規則 |
| `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` | Google OAuth；缺則登入頁的 Google 按鈕無作用 |
| `LINE_CHANNEL_ID/SECRET/CALLBACK_URL` | LINE OAuth |
| `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY/CALLBACK_URL` | Apple Sign-In；private key 是 .p8 內容（換行用 `\n`） |

### Production-only 啟動驗證（main.ts 已實作）

- 缺任一 **prod 必設** → process.exit(1)
- 缺任一 **prod 強烈建議** → logger.warn 但不阻擋

---

## 2a. ECPay sandbox local 整合測試（Phase S）

不需要真實商家帳號 — 用 ECPay 公開測試憑證 + 本地 webhook simulator。

### Sandbox 公開憑證（任何人都能用）

```bash
ECPAY_MERCHANT_ID=2000132
ECPAY_HASH_KEY=pwFHCqoQZGmho4w6
ECPAY_HASH_IV=EkRm7iFT261dpevs
ECPAY_PAYMENT_URL=https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5
```

### Local E2E flow（一鍵跑通 deposit + idempotency）

1. 啟 API（API_URL=http://localhost:3001）+ 帶上面四個 env
2. bb 登入後呼叫 `POST /api/v1/wallet/ecpay/order { amount: 500 }`，從回傳 HTML form 拿 `MerchantTradeNo`
3. 跑 webhook simulator：
   ```bash
   node scripts/simulate-ecpay-webhook.mjs <tradeNo> --replay
   ```
   - 第一次 callback → service 處理成功、wallet +500
   - replay 同一 callback → service 偵測到 status 已 success，直接 OK 但 NOT 雙重 credit
4. 用 `--fail` 模擬付款失敗 → wallet 不 credit

### Verified（Phase S smoke）

- `[first] HTTP 200 → '1|OK'` / `[replay] HTTP 200 → '1|OK'`
- wallet 5000 → 5500（+500 一次，replay 不重複）
- `--fail` callback：5500 不變
- 所有測試後 reconciliation 5/5 仍過

### Webhook 路徑

`POST {API_URL}/api/v1/wallet/ecpay/callback` — **無 JWT**（綠界 server 直接 POST，用 CheckMacValue HMAC 驗源）。
路徑現在掛在 `EcpayWebhookController`，與 `WalletController` 分離。
記得在 ECPay 後台白名單加這個 URL。

## 2. ECPay sandbox / production 切換

| 環境 | 設定 |
|------|------|
| Sandbox | `ECPAY_PAYMENT_URL=https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`；申請測試商家帳號（30 分鐘核發）|
| Production | `ECPAY_PAYMENT_URL=https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`；正式商家簽約 |

webhook 路徑：`POST {API_URL}/api/v1/wallet/ecpay/callback`，**不需要 JWT**（用 CheckMacValue 驗簽）。
記得把這個 callback URL 加入綠界後台白名單。

---

## 2b. Fresh Postgres schema bootstrap（現在真的需要）

目前 production PostgreSQL 還沒全面切到 versioned migrations。
所以新建一顆空 DB 後，先用一次 bootstrap 把 schema 推進去，不然 API 雖然可能啟動，業務路由照樣會爆。

```bash
cd /home/aa/projects/quanwen
export DATABASE_URL=postgresql://<user>:<password>@<host>:5432/quanwen
bash scripts/bootstrap-render-postgres.sh
```

這招只建議用在「全新空庫」。長期正解還是補齊 migration pipeline，別把過橋方案當豪宅。

## 3. 部署流程（單機 Docker Compose）

```bash
# 1. 在 server 上 clone repo
git clone <repo-url> quanwen && cd quanwen

# 2. 複製 .env.example 並填好 prod 必設變數
cp .env.example .env
$EDITOR .env

# 3. 跑完整 stack（api + web + postgres + redis）
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build

# 4. 看 logs 確認 boot 過了 prod env check
docker compose logs -f api | head -50

# 5. Health check
# liveness（process 活著嗎；不查 DB/Redis，永遠輕量）
curl http://localhost:3001/api/v1/health
# → {"status":"ok","uptime":N,"env":"production"}

# readiness（能收流量嗎；查 DB SELECT 1 + Redis ping，strict）
curl -i http://localhost:3001/ready
# 全部 up → 200 {"status":"ok","checks":{"db":{"status":"up",...},"redis":{"status":"up",...}}}
# DB 或 Redis 任一 down → 503（LB / K8s 應據此把該實例移出輪詢）
```

> **探針怎麼接**：LB / orchestrator 的 **liveness** 指向 `/health`（失敗才重啟），
> **readiness** 指向 `/ready`（失敗只是暫時不送流量，不重啟）。
> Docker Compose 的 container healthcheck 維持用 `/health`（liveness），
> 避免 DB/Redis 短暫抖動就觸發容器重啟迴圈。

---

## 3a. 多副本部署（scale-out 前提）

開 2 台以上 API 前,以下三件事都已就緒(P2/P3/P4),但**必須有可用的共享 Redis**:

| 機制 | 沒 Redis 時 | 有 Redis 時 |
|------|------------|------------|
| **限流**（Throttler） | 逐實例 in-memory（各算各的，會告警 error log） | `qw:throttle:` 前綴跨實例共享計數 |
| **Cron**（互惠配對 / 超時） | 每台都跑（單實例 OK；多台會重複執行） | `qw:lock:mutual-*` 分散式鎖，只有一台執行 |
| **Readiness** | `/ready` 回 503（strict） | 200 |

- `REDIS_URL` 為唯一開關（已在 `docker-compose.full.yml` 的 api 設為 `redis://redis:6379`）。
- Redis 掛掉時:限流**降級為逐實例**(仍會擋、不會變無限流)、cron**暫停執行**(避免重複)、readiness 轉 503(LB 自動把實例移出)。皆有 log,不會 silent fail。
- `ioredis` 在 `apps/api` 的 optionalDependencies；`pnpm install --frozen-lockfile`(CI / Dockerfile)會安裝,故 prod image 內一定有。

---

## 4. 上線前 checklist

### Security

- [ ] `JWT_SECRET` 不是 default `change-me-...`；至少 32 chars 隨機
- [ ] `PII_ENCRYPTION_KEY` 與 `PII_KDF_SALT` 已設；備份金鑰到密管（一旦遺失，所有加密 PII 無法解密）
- [ ] `helmet` headers 在 `/health` response 出現（curl -I 看）
- [ ] CORS origin 限定到自己的 prod domain，不是 `*`
- [ ] Swagger 在 prod 已關（curl `/docs` 應 404）
- [ ] `.env` 不在 git；只在 server filesystem 或 secret manager
- [ ] Rate limit 預設 `short=10/sec, medium=100/min`，可在 ThrottlerModule 調；多副本時需 `REDIS_URL`（`qw:throttle:` 前綴跨實例共享，否則逐實例 in-memory）

### 法規

- [ ] Privacy policy `/privacy` 與 Terms `/terms` 內容已過律師
- [ ] 受試者錢包 UI 顯示「我的收益 / 待領取獎勵」**非**「儲值」（電支條例）
- [ ] KYC 流程在受試者首次提領 ≥ NT$2,000 自動觸發
- [ ] 對帳 cron 每日跑（目前 `GET /admin/reconciliation` 手動觸發，prod 可加 `@nestjs/schedule` cron）

### Observability

- [ ] Sentry DSN 設好，故意觸發 error 確認 Sentry dashboard 有收到
- [ ] Admin 通知 channel（Slack/LINE webhook）接到 ReconciliationService / MultiAccountDetector 的 admin alert
- [ ] DB 備份每日 + retention 7 天以上

### 帳號

- [ ] dev seed accounts (`aa@aa.aa`, `bb@bb.bb`, `cc@cc.cc`) **不在** prod build 內（PGlite 只用於 `USE_PG_MEM=true` dev/test）
- [ ] 第一個 admin 帳號用 `pnpm db:seed` 或手動 INSERT 建立，密碼夠強

### CI

- [x] GitHub Actions `.github/workflows/ci.yml` 跑 type-check / lint / audit / test / build / e2e
- [ ] Branch protection 規則：main 需要 CI 全綠 + 1 個 review
- [ ] `pnpm audit --audit-level=high` 在 CI 改成 hard fail（目前 continue-on-error）

---

## 5. 故障排除

| 症狀 | 可能原因 |
|------|----------|
| API boot exit 1「缺少必要環境變數」 | 對照上面 prod 必設清單 |
| 提領失敗 `餘額不足（可能有其他提領正在處理）` | 正常的併發保護；用戶 retry 即可 |
| `GET /admin/reconciliation` 跑出 invariant fail | 看 note 欄找差異；常見是 dev seed 沒寫 journal_entries 或 admin 手動改了 DB |
| Login 變慢 | bcrypt 12 rounds × N 個 concurrent login，可降到 10 rounds |
| LLM 端點 500 | ZAI_API_KEY 未設或額度耗盡；fall back 改成 fail-open（藍色 banner 告知 admin） |
| OAuth Google/LINE/Apple 按鈕無反應 | 對應 ENV 未設；在 main.ts startup log 看 `🔐 OAuth providers` 確認 |
| 中文 email displayName 在 mail 亂碼 | SMTP_HOST 的 SMTP server 不支援 UTF-8；改 SMTP provider |

---

## 6. Rollback

```bash
# 1. 把 image tag 換回上一個 release
docker compose -f docker-compose.yml -f docker-compose.full.yml \
  pull && docker compose up -d --no-build

# 2. 若需要 DB rollback，先 backup 再 restore
pg_dump > /backup/before-rollback.sql
psql < /backup/<previous-version>.sql
```

Schema 變更必須是 backwards-compatible（add column 可，drop / rename 需兩階段 migration）。
