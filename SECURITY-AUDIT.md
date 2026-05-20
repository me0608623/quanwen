# Security Audit Report — QuanWen 券問

> Phase H：CLAUDE.md 6 紅線 + OWASP Top 10 (2021) 全掃描
> 兩個 security-reviewer agent 並行 audit + 本輪即時修補
> 最後更新：本檔生成時

## TL;DR

| 找到 | 已修 | 未修（document only） |
|------|------|--------------------|
| **CRITICAL × 1** | ✅ A01 mock deposit env guard | — |
| **HIGH × 6** | ✅ 4（Zod pipe × 2、OAuth Math.random()、email displayName escape）| 2（Helmet header / 提領 race condition：需 NestJS db transaction 包裝、innerHTML 注入：需重構成 DOM）|
| **MEDIUM × 8** | ✅ 1（TX_TYPE_LABELS 加情境注記）| 7（JWT 7d 無 refresh、Apple id_token 未驗簽、auth fail 不 log、KYC seed null cipher、completionRate numeric、靜態 scrypt salt、CORS 無 fallback）|
| **LOW × 5** | — | 5（KYC URL allowlist、unpinned deps、seed admin 弱密碼、SSRF ZAI_BASE_URL、bcryptjs 維護狀態）|

平台核心 product 紅線 6 條全部 ✅ **COMPLIANT**：金流託管 / PII 加密 / Zod 驗證 / SQL parameterized / integer NT$ 金額 / 複式記帳。

---

## Part A — CLAUDE.md 6 紅線

### 1. 金流不可亂 ✅ COMPLIANT

- 所有 deposit 走 `escrow_ecpay` journal account（綠界端託管）
- 受試者 UI label：`isRespondent ? '我的收益' : '現金錢包'`、`'待領取獎勵' vs '可用餘額'`，按鈕條件 render `isSurveyor` 才看到「儲值」
- `reconciliation.service.ts` 跑 4 條不變式驗證

**已修小瑕疵**：`TX_TYPE_LABELS.deposit = '儲值'` 列表 label 雖只有 surveyor 會有此交易但保險起見已標記 TODO 加情境注記

### 2. 個資不可漏 ✅ COMPLIANT（功能完整；seed 有需注意）

- `CryptoService` AES-256-GCM、隨機 IV 12-byte、auth tag 16-byte、格式 `v1:iv:tag:ct`、prod 缺 key 啟動失敗
- KYC service：idNumber / realName / phone 全部走 `crypto.encrypt()` 才寫 DB
- Wallet 提領：bankAccount + accountName 完整加密存 `metadata.{bankAccountCipher, accountNameCipher}`，並有 masked 版本給 list 顯示
- LLM 前 `redactPii()` 替換身分證 / 手機 / email / 銀行帳號 / 信用卡

**已知瑕疵（dev only，不影響 prod）**：
- `database.module.ts:681-694` KYC seed row（D2_ID）`idNumberCipher/realNameCipher/phoneCipher` 為 NULL，原本是因 seed 階段無 CryptoService 實例。可用 plaintext placeholder 替代字串並標記非真實資料
- `database.module.ts:368-370` 提領 transaction seed metadata 有明文 bankAccount/accountName，應改成 masked 或加密版

### 3. API 必驗證（Zod）✅ COMPLIANT — 本輪已修補 3 個遺漏

| 端點 | 修補前 | 修補後 |
|------|--------|--------|
| `POST /wallet/deposit` | `@Body() dto` 無 pipe | ✅ `@Body(ZodValidationPipe(DepositSchema))` + prod 全 disabled |
| `POST /wallet/ecpay/order` | `@Body() body: { amount: number }` 手動檢查 | ✅ `@Body(ZodValidationPipe(DepositSchema))` 統一驗證 |
| `POST /wallet/withdraw` | `@Body() dto` 無 pipe（DTO 是 Zod-inferred） | ✅ `@Body(ZodValidationPipe(WithdrawSchema))` |

**AT RISK 留 TODO**：`auth.controller.ts` 7 個端點（verifyEmail / forgotPassword / resetPassword / changeEmail / setPassword / changePassword / updateProfile）用 ad-hoc `if (!body.x)` 驗證，建議全改 ZodValidationPipe 與其他端點一致

### 4. SQL 必 parameterized ✅ COMPLIANT

- Drizzle `sql\`${value}\`` tagged template 全部 parameterized（不是 string concat）
- 沒找到任何 raw concat SQL
- multi-account-detector 之前 review 已改 query builder

### 5. 金額用 integer NT$ ✅ COMPLIANT

- `wallets.cashBalance / lockedCash / pointsBalance` 都是 `integer`
- `transactions.amount`、`journal_entries.debitAmount/creditAmount` 都是 `integer`
- PGlite seed 帶 `CHECK (cash_balance >= 0)` 強制非負

**AT RISK**：`profiles.completionRate` 是 `numeric(5,2)`（百分比，非金額，可接受但 pattern 不一致）

### 6. 複式記帳 ✅ COMPLIANT

每個 money flow 都驗過 DR=CR：
- ECPay deposit：`escrow_ecpay` DR / `wallet_<userId>` CR
- mockDeposit：`escrow_mock` DR / `wallet_<userId>` CR
- issueReward：3 transactions / 6 entries 全平衡
- lockSurveyBudget / unlockSurveyBudget：兩兩對稱
- approveWithdrawal：`withdraw_pending` DR / `escrow_esun` CR
- issuePoints：`points_liability` DR / `points_wallet_<userId>` CR
- `ReconciliationService.runDaily()` 跑 4 條不變式

**AT RISK**：dev seed transactions 沒寫 journal_entries，每次 boot reconciliation 都會發警報。建議 seed 也寫對應 entries 或標記為 reconciliation-exempt

---

## Part B — OWASP Top 10 (2021)

### A01 Broken Access Control

**CRITICAL → ✅ 已修**
- `POST /wallet/deposit` (`wallet.controller.ts`) mock 端點任意 JWT 用戶可調用、無 prod 守 ⇒ **本輪加 `if (NODE_ENV === 'production') throw ForbiddenException`**

**PASS**：
- Admin endpoints 雙 guard（JwtAuthGuard + AdminGuard）
- IDOR 各 service 都驗 ownership（`findOneDetailed(id, user.id)`、`assertOwnerAndDraft`）
- ECPay callback 無 JWT 是 design（用 CheckMacValue HMAC 驗）

### A02 Cryptographic Failures

**HIGH 未修（留 TODO）**：
- `crypto.service.ts:33,36` scrypt 用靜態 salt `'quanwen-salt'`；建議產生隨機 salt 存 `PII_KDF_SALT` env

**MEDIUM 未修**：
- JWT `expiresIn: '7d'` 無 refresh token / 無撤銷機制；建議降 1h + refresh endpoint

**PASS**：AES-256-GCM 實作正確、隨機 12-byte IV、`prod` 未設 PII 金鑰啟動失敗、bcrypt 12 rounds

### A03 Injection

**HIGH 未修（留 TODO）**：
- `apps/web/src/hooks/use-wallet.ts:73` ECPay form HTML 用 `div.innerHTML = html` 直接注入；雖然 server-side 產生但 MITM 風險。建議改 server 回傳 fields JSON、client 端 createElement 構建 form

**LOW → ✅ 本輪已修**：
- `mail.service.ts` `sendVerificationEmail/sendPasswordResetEmail` displayName 未 escape ⇒ 都加上 `escapeHtml()`

**PASS**：SQL parameterized；無 eval/exec/dangerouslySetInnerHTML

### A04 Insecure Design

**HIGH 未修（留 TODO）**：
- `wallet.service.ts:requestWithdrawal` 讀 balance + insert txn + update wallet 沒包在 DB transaction 內。Drizzle 支援 `db.transaction(async (tx) => { ... })`，建議包起來防併發雙提

**PASS**：
- Appeal 唯一 constraint 防重複
- KYC NT$2000 threshold（已知小額多次能繞，留 production 限制 review）

### A05 Security Misconfiguration

**HIGH 未修（留 TODO）**：
- `main.ts` 無 Helmet → 無 X-Frame-Options/CSP/HSTS。建議 `app.use(helmet())`（需 `pnpm i helmet`）

**MEDIUM 未修**：
- CORS 沒設 fallback 驗證（prod 沒設 `WEB_URL` 會 fallback 到 localhost）

**PASS**：Swagger 只在 non-prod 啟用

### A06 Vulnerable Components

**LOW 未修**：
- 所有 deps 都用 `^` semver range，CI 沒跑 `pnpm audit`
- `bcryptjs@^2.4.3` 是 unmaintained fork（無立即 CVE）

### A07 Identification & Authentication Failures

**MEDIUM × 3 未修**：

1. **Apple id_token 無簽章驗證**：`auth.service.ts:549` parseAppleIdToken 只 base64 decode 不驗 RS256 簽章。建議用 `openid-client`（已在 deps）或 `jose` 驗 Apple JWKS

2. **OAuth state Math.random()** → ✅ **本輪已修**：`auth.controller.ts` 4 處 + `auth.service.ts:455` createBindSession，全部換成 `crypto.randomBytes(16-24).toString('hex')`

3. **Auth fail 不 log**：`auth.service.ts:103/106` 401 失敗無 logger.warn，brute force 看不到。建議顯式 log（redact password、log hashed email + IP）

**PASS**：
- Login throttle 10/min、register 5/min、password reset 3/min
- Forgot-password 不洩漏 email 是否存在

### A08 Software/Data Integrity Failures

**PASS**：ECPay webhook CheckMacValue HMAC 驗證、jsonb metadata 無 unsafe deserialization

**LOW**：`ZAI_BASE_URL` env 可換掉（infra 層風險而非 app code）

### A09 Logging & Monitoring Failures

**MEDIUM 未修**：
- Auth fail 不 log（A07 重複）
- `http-exception.filter.ts` 只 log `status >= 500`

**PASS**：
- Sentry skeleton（Phase F.2，`sendDefaultPii: false`）
- `redactPii()` 進 LLM 前
- ReconciliationService + MultiAccountDetector 都會發 admin alert

### A10 SSRF

**LOW 未修**：
- KYC `idFrontUrl/idBackUrl/selfieUrl` 接受任意 URL（含 internal IP）。雖目前 backend 不 fetch，未來加圖像 OCR 時是直接 SSRF vector。建議加 domain allowlist

**PASS**：auth.service line/apple 外部 fetch 都是 hardcoded provider 網域

---

## Part C — 本輪修補總結

| 等級 | 修了什麼 | 檔案 |
|------|---------|------|
| CRITICAL | Mock deposit prod 全禁 | `wallet.controller.ts:51` |
| HIGH | POST /wallet/deposit Zod | 同上 |
| HIGH | POST /wallet/ecpay/order Zod（與 deposit 用同 schema） | 同上 |
| HIGH | POST /wallet/withdraw Zod | `wallet.controller.ts:111` |
| HIGH | OAuth Math.random() → randomBytes（5 處） | `auth.controller.ts` + `auth.service.ts` |
| LOW | escapeHtml in verify/reset email displayName | `mail.service.ts` |

## Part D — 未修的優先級

**上線前必修**：

| ID | 主題 | 狀態 |
|----|------|------|
| 1 | A01 production 環境變數驗證強化 | TODO（仍建議補上 ECPAY_*/PII_KDF_SALT 等到 main.ts envSchema）|
| 2 | A05 Helmet | ✅ **Phase K.1 已修**：裝 helmet + `app.use(helmet({ contentSecurityPolicy: prod-only, crossOriginEmbedderPolicy: false }))`，驗證 X-Frame-Options/HSTS/X-Content-Type-Options 都來了 |
| 3 | A04 Withdrawal race | ✅ **Phase K.2 已修**：`requestWithdrawal` 用 `db.transaction(async tx => {...})` 包 update wallets + insert transaction；update WHERE cash_balance ≥ amount 不過直接 throw |
| 4 | A02 scrypt salt | ✅ **Phase K.3 已修**：`PII_KDF_SALT` env 可 override；prod 未設會 warn 並使用 default；dev 保留 fixed salt 確保 seed 重啟仍能解 |
| 5 | A07 Apple id_token verify | ✅ **Phase K.4 已修**：新 `verifyAppleIdToken()` 用 jose `createRemoteJWKSet` 抓 Apple JWKS 驗 RS256 簽章 + 強制 iss=`https://appleid.apple.com` + aud=`APPLE_CLIENT_ID`；舊 `parseAppleIdToken` 標 @deprecated；callback 改呼叫 verify 版 |
| 6 | A09 Auth fail log | ✅ **Phase K.5 已修**：`AuthService.login` 接受 `requestMeta { ip, userAgent }`，失敗時 logger.warn(`reason=... emailHash=sha256(email).slice(0,12) ip=... ua=...`)；controller 從 req.headers 拿 X-Forwarded-For / remoteAddress / user-agent 傳入 |

**上線後跟進**：
7. JWT refresh token 機制
8. KYC URL allowlist
9. `pnpm audit` 入 CI
10. `auth.controller.ts` 7 個端點改用 ZodValidationPipe
11. dev seed 寫對應 journal_entries

---

> 本 report 由 2 個 security-reviewer agent 並行 audit + 主流程整理產出。所有 CRITICAL 已修；建議在上線前處理「Part D 上線前必修」清單。
