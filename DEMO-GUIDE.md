# 券問 QuanWen — Demo 指南

> 一份給看 demo 的人的「按圖索驥」清單。

## 快速啟動

```bash
# 從 問券/ root（含此 quanwen/ 子目錄與所有設計文件）

# 啟動 API（自動 seed in-memory PGlite + 自動建好 demo 資料）
cd quanwen/apps/api && pnpm dev
# → http://localhost:3001/api/v1

# 另一個 terminal 啟動前端
cd quanwen/apps/web && pnpm dev
# → http://localhost:3000
```

## 3 個 demo 帳號（無痕視窗免 cookie 衝突）

| Email | 密碼 | 身份 | 登入後路徑 |
|-------|------|------|-----------|
| `aa@aa.aa` | `aa` | 受試者 | `/tasks` |
| `bb@bb.bb` | `bb` | 問券方 | `/dashboard` |
| `cc@cc.cc` | `cc` | 管理員 | `/admin` |

帳號在 API 啟動時自動 seed，重啟也不會消失。

---

## 🤖 10 個 AI 接點（Z.ai GLM-5.1 Coding Plan）

### 受試者體驗

#### ① AI 個人化推薦
- **登入** `aa@aa.aa / aa` → 進 `/tasks`
- 頂部「AI 推薦」面板 → 點「取得推薦」
- 約 15-30 秒後看到：最適合你的問卷（含原因）+ 累計收益/本週潛能 + 賺更多技巧

### 問券方體驗

#### ② AI 草稿生成（從零）
- 登入 `bb@bb.bb / bb` → `/dashboard` → 新增問卷
- 點 `✨ AI 草稿生成` → 輸入主題 → 約 30 秒得到完整 5-8 題

#### ③ AI 優化建議（針對既有問卷）
- `/dashboard/surveys/<id>` 點開任一問卷編輯頁
- 看「AI 優化建議」面板 → 取得建議
- 拿到：整體分數、優點、具體缺點（含題目 index）、建議補充題型、wording tips

#### ④ AI 助手「下一步」
- `/dashboard` 頂部「AI 助手」面板
- 點「取得建議」→ LLM 挑出最該優先處理的問卷 + 整體洞察 + 警示

#### ⑤ AI 填答洞察報告
- 進已上架問卷的 `/dashboard/surveys/<id>/stats`
- 「AI 洞察報告」面板 → 生成洞察
- 拿到：summary + 主要發現 + 注意事項 + 建議下一步

#### ⑥ AI 開放題情緒分類
- 同 stats 頁 → 找文字題（type=text）
- 點「✨ AI 情緒分類」按鈕
- 拿到：正/中/負情緒長條圖 + 重複主題（含頻率徽章與引用範例）

### 管理員體驗（`cc@cc.cc / cc`）

#### ⑦ AI 平台健康摘要
- `/admin` 頂部「AI 平台健康摘要」面板
- 點「生成摘要」→ status badge (健康/需注意/需處理) + headline + 正面指標 / 需注意項 / 建議行動

#### ⑧ AI 問卷審核諮詢
- `/admin/surveys` 篩選 `待審核`
- 每筆問卷右側「✨ 請 AI 給意見」
- 拿到：0-100 評分 + 問題列表 + 改進建議（admin 自行決定通過/退回）

#### ⑨ AI 可疑填答分析
- `/admin/responses`（已預填 1 筆可疑樣本）
- 點「✨ AI 分析」→ severity badge + reasoning + 具體訊號 + 處置建議

#### ⑩ AI 提領詐欺風險
- `/admin/withdrawals`（已預填 1 筆 aa 申請 NT$300，但 aa 累計獎勵僅 NT$160）
- 點「✨ AI 風險」→ 風險等級 + 紅旗訊號 + 建議（reject / manual_review / approve）

---

## 🔑 為什麼 Z.ai 是真的 LLM

每個面板顯示「生成於 YYYY-MM-DD HH:mm」的時戳。每次點「重新生成」會打一次真 Z.ai API（GLM-5.1，吃 Coding Plan 訂閱額度）。如果你看到 status=critical 是因為 LLM 看到「可疑填答比例 1/3 = 33%」自動觸發 → 不是寫死的閾值。

如果 Z.ai 服務暫時不可用，每個接點都有 **fallback** 規則式回退，保證 demo 不會壞掉（會顯示「AI 服務暫時不可用」訊息但 UI 仍正常）。

---

## 📊 端到端 demo 流程（建議順序）

1. **未登入訪客** → 開 `/` 看 landing page（漸層 + 動態磁磚）
2. **問券方 demo** → `bb@bb.bb` 登入 → dashboard → 點 AI 助手 → 進某問卷 stats → 看 AI 洞察 + 情緒分類
3. **管理員 demo** → 無痕 `cc@cc.cc` 登入 → admin 頂部 AI 健康摘要 → 進 surveys 審核 → 進 responses → 進 withdrawals
4. **受試者 demo** → 無痕 `aa@aa.aa` 登入 → tasks → AI 推薦 → 填一份問卷

---

## 🧪 Demo 前 Smoke Test

開 PowerShell 在 `quanwen/` 跑：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-ai.ps1
```

會自動登入 3 個帳號 + 串測 10 個 AI 接點。約 3-5 分鐘跑完，看到：

```
✅  Pass: 10 / 10
```

代表 demo 可以開始。如果有紅燈 → 通常是 Z.ai 帳號額度問題或 API 沒啟動。

---

## 🛡️ Phase 5-9 雙邊監督體驗（亮點功能）

完整 product story：**AI 幫問券方找真實有效樣本、幫平台監督亂填、給受試者透明訊號**。

### 🅰️ AI 反作弊設計輔助（問券方端，上架前）

`bb@bb.bb / bb` 登入 → 進任一草稿問卷編輯頁：

1. **「✨ AI 加反作弊題」** — AI 根據題型分布建議 1-2 題注意力檢核題（指令型/常識型/計算型），勾選後一鍵插入
2. **「🔍 上架前 AI 預審」** — AI 給 red flags（high/medium/low）、estimatedCompletionRate、hasAntiCheatMechanism 警示
3. **反向題對綁定** — rating 題下拉選另一 rating 題作為「反向題」(`config.reverseOfIndex`)；後台會自動算一致性
4. **🛡️ 受眾過濾 slider** — 「最低信譽分」0-100 階梯，篩掉常被退件的受試者

### 🅱️ 品質審核三層管線（後台自動跑）

每筆 submit 自動進入：

1. **Layer 1+2 規則層**：行為訊號 / 注意力檢核答對率 / 反向題一致性 / 開放題質量
2. **Layer 3 LLM 灰區裁決**：分數落在 40-75 才呼叫 holistic-judge（省 token）
3. **三段判決**：≥80 passed / 50-79 suspicious / <50 rejected
4. **連續 3 次 rejected**：停權 7 天 + reputation 即時扣 5 分

### 🅲️ 受試者透明化（profile 頁）

`aa@aa.aa / aa` 登入 → `/profile`：

1. **📊 我的填答品質** — Trust badge + 3 種狀態 count + 平均分
2. **最近一筆被標記** — 顯示扣分原因；< 50 分有「提出申訴」按鈕
3. **申訴 modal** — 填理由送出 → admin 在 `/admin/appeals` 審
4. **📈 信譽分趨勢 sparkline** — 最近 10 筆變動（reputation_history seed 預填趨勢）
5. **申訴紀錄 details** — pending / 通過 / 駁回 badge + 管理員備註

### 🅳️ 申訴流程（admin 端閉環）

`cc@cc.cc / cc` → `/admin/appeals`：

- demo seed 預埋 **1 筆 pending 申訴**（D1 對被退件的填答）
- tab 切換 pending / approved / dismissed
- 通過 → 自動補發獎勵 + reputation +5 + 改判 response=rewarded + 雙邊通知
- 駁回 → 需附 ≥5 字說明 + 通知受試者

### 🅴️ KYC 身份驗證（Phase B 法規）

`/admin/kyc`：

- 受試者首次提領 ≥ NT$2,000 強制 KYC，否則 wallet API throw 403
- demo seed 預埋 **1 筆 pending KYC**（D2）
- PII 欄位（身分證、姓名、手機）**AES-256-GCM** 加密儲存，僅此頁解密顯示
- 開放題送 LLM 前 `CryptoService.redactPii()` 把身分證/手機/email/銀行帳號 → token

### 🅵️ 對帳服務（Phase A 法規）

`GET /admin/reconciliation`（用 curl 看 JSON）：

- 4 條不變式：每筆 txn 借貸平衡 / wallets 加總 = journal wallet_* / reward_payable=0 / escrow_ecpay ≈ wallets + 累計手續費
- 任一失敗即發 admin 系統通知

### 🅶️ 受試者錢包字眼差異（Phase A 法規）

| Role | Tab label | 餘額 label | 說明 |
|------|-----------|----------|------|
| 受試者 | 我的收益 | 待領取獎勵 | ⓘ 款項由綠界託管，平台不持有現金 |
| 問券方 | 現金錢包 | 可用餘額 | — |

避開電支條例「儲值」字眼。

---

## 🧪 E2E 測試（Phase C）

```bash
cd quanwen/apps/web && pnpm test:e2e          # 全部
pnpm test:e2e --headed                         # 看到瀏覽器互動
pnpm test:e2e smoke                            # 只跑 smoke
```

涵蓋：
- `smoke.spec.ts` — 三方登入
- `respondent-journey.spec.ts` — tasks 列表 + 品質區塊 + 信譽分 sparkline
- `surveyor-journey.spec.ts` — dashboard + AI 反作弊 + 受眾 slider + stats + wallet
- `admin-journey.spec.ts` — overview 入口 + appeals + KYC + responses + surveys

> 假設 API:3001（自動 seed）、Web:3000。CI 模式（`CI=1`）會自動 spin up 兩個 dev server。

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| 前端 | Next.js 14.2.30 (App Router), Tailwind v3, shadcn/ui, React Hook Form + Zod, TanStack Query v5 |
| 後端 | NestJS 10, Drizzle ORM, PGlite (in-memory dev) |
| Auth | JWT + Google/LINE/Apple OAuth (Passport.js) |
| LLM | Z.ai GLM-5.1 (Coding Plan endpoint, OpenAI-compatible, JSON mode) |
| Crypto | AES-256-GCM（PII）+ scrypt KDF（key derivation）|
| E2E | Playwright 1.43 |
| Monorepo | pnpm workspaces |

---

## 🚦 Known Limitations

- **In-memory DB**：API 重啟資料會丟失（除 seed 帳號每次自動重建）
- **OAuth**：Google/LINE/Apple 按鈕需要設定 `.env` 對應 credentials 才能真正跳轉
- **ECPay 儲值**：sandbox/mock 模式，正式環境需設定 `ECPAY_*` env + 商家驗證
- **PII 加密金鑰**：dev 用 fallback key（log 會 warn），prod 必須設 `PII_ENCRYPTION_KEY`，否則啟動失敗
- **SMTP 寄信**：未設定時 forgot-password / 驗證信不會真送出（log 中可見內容）
- **KYC 證件影像 OCR / 人臉比對**：尚未接（admin 目前手動審）
