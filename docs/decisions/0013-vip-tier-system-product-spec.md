# ADR-0013: VIP 等級制度 — AI 功能配額與付費方案

> **Issue**: QUA-245  
> **Owner**: Product Planner  
> **Status**: Draft — 待 CEO 核准  
> **Date**: 2026-06-02  
> **Affects**: DB schema, API (surveys, wallet, new subscription module), Web (pricing page, dashboard, settings)

---

## 1. 問題陳述

目前所有 AI 功能（AI 問卷草稿、單題重生、定價顧問、AI 品質審核）對所有用戶無限量開放。這造成三個風險：

1. **成本失控** — 每次呼叫 Z.ai GLM-5.1 都花錢，無限用量 = 無限 API 費用
2. **無法變現** — PRICING-ROI-STRATEGY.md 定義了 4 個收費層級，但程式碼零實作
3. **缺乏誘因** — 用戶沒有升級理由，付費動機為零

---

## 2. 方案設計

### 2.1 用戶層級定義（Surveyor 側）

| Tier | 月費 NT$ | 問卷份數/月 | AI 草稿次數 | AI 單題重生 | AI 定價顧問 | AI 品質審核 | 匯出格式 |
|------|---------|------------|------------|------------|------------|------------|---------|
| **Free** | 0 | 100 | 3/月 | ❌ | ❌ | 自動（灰區觸發） | CSV |
| **Starter** | 299 | 1,000 | 20/月 | ✅ 10/月 | ✅ 5/月 | 自動 + 摘要 | CSV, Excel |
| **Pro** | 999 | 5,000 | 無限 | 無限 | 無限 | 自動 + 摘要 + 詳細報告 | 全格式 |
| **Enterprise** | 議價 | 無限 | 無限 | 無限 | 無限 | 全功能 + 自訂規則 | 全格式 + API |

### 2.2 Respondent 側（填答者等級）

Respondent 不付月費，但有**信譽等級**驅動的配額：

| 等級 | 條件 | 權益 |
|------|------|------|
| **Bronze** | 預設（reputation 0-59） | 每日最多接 5 份任務 |
| **Silver** | reputation 60-79 | 每日最多接 15 份 + 優先匹配中高獎勵問卷 |
| **Gold** | reputation 80-94 | 每日最多接 30 份 + 優先匹配高獎勵 + VIP 問卷池 |
| **Platinum** | reputation 95+ | 無限制 + 優先匹配 + VIP 池 + 加成獎勵 ×1.1 |

> **不新增付費牆給填答者**。填答者等級純粹由信譽驅動，這是核心理念——認真填答 = 更好機會。

### 2.3 配額計量規則

1. **計量週期**: 每月 1 號 00:00 CST 歸零
2. **AI 品質審核不算在配額內** — 這是平台品質保證，非用戶主動呼叫
3. **AI 草稿/重生/定價**: 用戶主動呼叫時計量，達上限回傳 `429 Too Many Requests` + `Retry-After` header
4. **問卷份數**: 發布時計量（`status=published` 時扣），關閉問卷不退還計量
5. **超額處理**: 不允許超額，UI 在接近上限時顯示升級提示

---

## 3. 資料庫 Schema 變更

### 3.1 新增表: `subscriptions`

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',  -- free|starter|pro|enterprise
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active|past_due|cancelled|expired
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_sub_id VARCHAR(200),  -- 未來串接 Stripe 用，Phase 2
  ecpay_trade_ref VARCHAR(200), -- ECPay 定期定額參考碼
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)  -- 一人一訂閱
);
CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);
CREATE INDEX subscriptions_tier_idx ON subscriptions(tier);
```

### 3.2 新增表: `quota_usage`

```sql
CREATE TABLE quota_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature VARCHAR(50) NOT NULL,  -- ai_draft|ai_regen|ai_pricing|survey_publish
  period_start DATE NOT NULL,    -- 2026-06-01
  period_end DATE NOT NULL,      -- 2026-07-01
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, feature, period_start)
);
CREATE INDEX quota_usage_user_feature_idx ON quota_usage(user_id, feature, period_start);
```

### 3.3 新增表: `tier_limits`（設定表，不多）

```sql
CREATE TABLE tier_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(20) NOT NULL,
  feature VARCHAR(50) NOT NULL,
  limit_value INTEGER NOT NULL,  -- -1 = 無限
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tier, feature)
);
```

**預設 seed 資料**:

| tier | feature | limit_value |
|------|---------|-------------|
| free | survey_publish | 100 |
| free | ai_draft | 3 |
| free | ai_regen | 0 |
| free | ai_pricing | 0 |
| starter | survey_publish | 1000 |
| starter | ai_draft | 20 |
| starter | ai_regen | 10 |
| starter | ai_pricing | 5 |
| pro | survey_publish | 5000 |
| pro | ai_draft | -1 |
| pro | ai_regen | -1 |
| pro | ai_pricing | -1 |
| enterprise | survey_publish | -1 |
| enterprise | ai_draft | -1 |
| enterprise | ai_regen | -1 |
| enterprise | ai_pricing | -1 |

### 3.4 修改表: `respondent_profiles`

新增欄：

```sql
ALTER TABLE respondent_profiles ADD COLUMN daily_task_limit INTEGER NOT NULL DEFAULT 5;
ALTER TABLE respondent_profiles ADD COLUMN reward_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00;
ALTER TABLE respondent_profiles ADD COLUMN vip_pool BOOLEAN NOT NULL DEFAULT FALSE;
```

> 這三個欄位由 cron job 根據 reputation 分數自動更新，不依賴 subscription。

---

## 4. API 設計

### 4.1 新增 NestJS Module: `SubscriptionModule`

```
apps/api/src/subscription/
├── subscription.module.ts
├── subscription.controller.ts
├── subscription.service.ts
├── quota.service.ts
├── dto/
│   ├── check-quota.dto.ts
│   └── upgrade-tier.dto.ts
└── subscription.test.ts
```

#### Endpoints

| Method | Path | 說明 | Auth |
|--------|------|------|------|
| GET | `/subscription/current` | 取得當前訂閱 + 用量摘要 | JWT |
| GET | `/subscription/usage` | 取得當月各功能已用/上限 | JWT |
| POST | `/subscription/upgrade` | 升級方案（觸發 ECPay 付款） | JWT |
| POST | `/subscription/cancel` | 取消訂閱（期末生效） | JWT |
| POST | `/subscription/ecpay-callback` | ECPay 定期定額回呼 | Public (驗簽) |

### 4.2 Quota Guard（裝飾器模式）

```typescript
// 使用方式：在 controller 上掛裝飾器
@Post('ai-draft')
@UseGuards(JwtAuthGuard, QuotaGuard)
@QuotaLimit('ai_draft')
aiDraft(...) { ... }
```

`QuotaGuard` 邏輯：
1. 從 JWT 取 userId → 查 `subscriptions` 得 tier
2. 查 `quota_usage` 得已用數量
3. 查 `tier_limits` 得上限
4. `used >= limit` → 拋 `429` + 剩餘資訊
5. 通過 → 放行，事後由 interceptor 遞增 `used_count`

### 4.3 Respondent 任務配額

`TasksService.getAvailableTasks()` 加上 respondent 等級過濾：
1. 查 `respondent_profiles.reputation_score` → 決定等級
2. 等級 → `daily_task_limit`
3. 今日已接任務數 ≥ limit → 回傳空列表 + header `X-Quota-Remaining: 0`
4. `vip_pool = true` → 額外可見標記為 VIP 的問卷（`surveys.vip_only = true` 新欄位）

---

## 5. 前端變更

### 5.1 升級 Pricing Page

目前的 `/pricing` 是靜態頁。改為動態顯示：
- 未登入用戶：show all 4 tiers
- 已登入用戶：highlight current tier + 升級 CTA
- Starter/Pro 的「訂閱」按鈕 → 呼叫 `/subscription/upgrade` → ECPay 付款流程

### 5.2 Dashboard 配額 Widget

在 surveyor dashboard 加入：
- 本月用量進度條（問卷份數 / AI 功能）
- 快到上限時黃色警告
- 達上限時紅色 + 升級按鈕

### 5.3 Settings 新增訂閱管理

`/settings/subscription` 頁面：
- 當前方案詳情
- 用量歷史（月對月）
- 升級/降級/取消
- 發票記錄

---

## 6. 實作分期（建議）

### Phase 1 — 基礎配額（2 週）
- [ ] 新增 `subscriptions`, `quota_usage`, `tier_limits` 表
- [ ] `SubscriptionModule` + `QuotaService`
- [ ] `QuotaGuard` 裝飾器
- [ ] 在 `ai-draft`, `ai-regen`, `pricing-advice` 掛上 QuotaGuard
- [ ] `GET /subscription/current` + `GET /subscription/usage`
- [ ] Dashboard 配額 widget（前端）
- [ ] **所有用戶預設 Free tier** — 不影響現有功能（免費用戶有 3 次 AI draft）
- [ ] E2E: 配額扣減 + 429 回應

### Phase 2 — 付費訂閱（2 週）
- [ ] `POST /subscription/upgrade` → ECPay 定期定額 API 整合
- [ ] `POST /subscription/ecpay-callback` 回呼處理
- [ ] `POST /subscription/cancel`
- [ ] 前端 `/settings/subscription` 頁面
- [ ] Pricing page 動態化 + 升級 CTA
- [ ] E2E: 完整付費流程

### Phase 3 — Respondent 等級（1 週）
- [ ] `respondent_profiles` 新增 3 欄位
- [ ] Cron: 根據 reputation 自動更新等級權益
- [ ] `TasksService` 加入等級過濾 + VIP 池
- [ ] Profile page 顯示等級徽章
- [ ] E2E: 等級升降 + 任務可見性

### Phase 4 — Enterprise & 進階（ongoing）
- [ ] Admin 介面管理 Enterprise 客戶訂閱
- [ ] API key 管理（Enterprise API 存取）
- [ ] 自訂審核規則
- [ ] Stripe 支援（海外客戶）

---

## 7. 紅線清單（PR Checklist）

- [ ] 所有金額 integer NT$，無 float
- [ ] 訂閱付款走 ECPay，不自收
- [ ] 所有 API input 用 Zod validate
- [ ] 新端點預設 JWT；`ecpay-callback` 用 `@Public()` + 驗簽
- [ ] QuotaGuard 在 service 之前執行，失敗不耗 AI 資源
- [ ] 不改變現有 15% platform fee 邏輯
- [ ] 不影響填答者收入（reward_multiplier 只增不減）

---

## 8. 預期影響

| 指標 | 現狀 | Phase 1 後 | Phase 2 後 |
|------|------|-----------|-----------|
| AI 成本控制 | 無限制 | 免費 3 次/月，其他付費 | 各層級配額 |
| 付費轉換率 | 0% | 0%（但收集用量數據） | 預估 5-10% |
| 問卷發布上限 | 無 | 100 份/月（免費用戶） | 按層級 |
| Respondent 留存 | 基線 | 不變 | 等級徽章 + VIP 池提升 |

---

## 9. 開放問題（需 CEO 決策）

1. **Free tier 問卷上限 100 份是否太嚴格？** 目前用戶已習慣無限制，直接加上限可能流失早期用戶。替代方案：Free tier 不限份數但限 AI 功能。
2. **降級處理**：用戶從 Pro 降為 Free 時，已發布的 5000 份問卷怎麼辦？建議：已發布的不追溯，但不能再發新的。
3. **年繳折扣**：PRICING-ROI-STRATEGY.md 提到年繳 10% off，Phase 2 是否一起做？
4. **ECPay 定期定額 vs 手動續約**：定期定額需要 ECPay 特約，手動續約門檻低但流失率高。

---

*本文件為 Product Planner 產出，待 CEO @任 核准後進入 Phase 1 開發。*
