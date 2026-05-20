# Overnight Session Log — 2026-05-19 ~ 2026-05-20

> 自走 dev loop（22:00 ~ 10:00 Taipei，~24 iterations 每 25 min 一輪）

## 主要交付

### 10 個 AI 接點（Z.ai GLM-5.1，全部端對端測過）

| # | 角色 | 端點 | 功能 |
|---|------|------|------|
| 1 | 受試者 | `GET /tasks/assistant` | AI 推薦最適合的問卷 + 賺更多技巧 + 收益估算 |
| 2 | 問券方 | `GET /surveys/assistant` | AI 助手「下一步該做什麼」+ 洞察 + 提醒 |
| 3 | 問券方 | `GET /surveys/:id/ai-improve` | 對既有問卷的優化建議（評分 + 4 段）|
| 4 | 問券方 | `GET /surveys/:id/ai-insights` | 填答結果洞察報告（summary + findings + concerns + recommendations）|
| 5 | 問券方 | `GET /surveys/:id/questions/:qid/sentiment` | 開放題情緒分類（pos/neu/neg + themes + 範例）|
| 6 | 管理員 | `GET /admin/health-summary` | 平台健康摘要（status + 指標 + 行動）|
| 7 | 管理員 | `GET /admin/surveys/:id/ai-review` | 問卷審核諮詢（分數 + issues + suggestion）|
| 8 | 管理員 | `GET /admin/responses/:id/ai-analysis` | 可疑填答分析（severity + signals + recommendation）|
| 9 | 管理員 | `GET /admin/withdrawals/:id/ai-risk` | 提領詐欺風險（riskLevel + redFlags + recommendation）|
| 10 | 問券方 | `POST /surveys/ai-draft` | AI 一鍵生問卷草稿 |

每個都有完整前端面板（漸層 + sparkle icon + 彩色 badges + 結構化結果）+ fallback 規則式回退（LLM 故障時不會壞掉）。

### Z.ai 整合突破

| 問題 | 解法 |
|------|------|
| 餘額不足（429）| 切換到 Coding Plan endpoint `/api/coding/paas/v4` |
| LLM 回非 JSON | 加 `response_format: { type: 'json_object' }` |
| GLM-5.1 reasoning 吃光 token | `max_tokens` 1200 → 8000（容納 reasoning + 輸出）|

### Seed 資料補強

- 3 個基本帳號 (`aa/bb/cc`) + 7 個 demo respondents
- 3 已上架問卷 + 2 待審問卷（含完整題目選項）
- aa 對 survey-1 完整填答 + 5 個 demo 各自不同情緒/評分的回答（讓 LLM 看到豐富樣本）
- 3 筆獎勵交易、1 筆提領申請、5 筆通知
- 1 筆可疑填答（高 anti-cheat score）

### Demo 文件

- `DEMO-GUIDE.md` — 看 demo 的人按圖索驥
- `scripts/smoke-ai.ps1` — demo 前一鍵跑測 10 AI 接點

### Bug 修補

- `stats` 不算 `rewarded` responses（改為接受 submitted + rewarded）
- PGlite seed 缺 `reward_type` 欄位
- `wallets` join 不存在的 `amount` 欄位
- `selectRole` 對 OAuth 新用戶永遠擋下（新增 `roleSelectedAt` 欄位）

### 視覺一致性

所有 10 個 AI 面板統一風格：漸層背景 `from-#126b8a` → `#8B5CF6`、sparkle icon、彩色 status/severity badges、生成時戳、fallback 友善訊息。

---

**狀態**：所有 AI 接點 smoke test 10/10 通過。demo 可以直接 ship。
