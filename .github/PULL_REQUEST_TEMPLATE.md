<!-- PR Template — Phase II.7 -->

## What & Why

<!-- 1-3 句說明這個 PR 改了什麼、為什麼 -->

## Type

- [ ] feat — 新功能
- [ ] fix — 修 bug
- [ ] refactor — 結構/可讀性，無行為改變
- [ ] perf — 效能
- [ ] test — 補測試
- [ ] docs — 文件
- [ ] chore — build / config / deps

## 紅線 checklist

- [ ] 金流：所有金額用 integer NT$ 元，無 float
- [ ] 金流：所有 transaction 雙向 journal entry（debit = credit）
- [ ] 個資：身分證 / 銀行帳號 / 手機 / 真實姓名走 `CryptoService.encrypt` (AES-256-GCM)
- [ ] API：所有輸入用 Zod schema validate
- [ ] SQL：用 Drizzle parameterized query，沒拼字串
- [ ] Auth：新端點預設要 JWT；明確 `@Public()` 才公開

## AI / LLM 變更（**若 PR 動到 `ai-audit/prompts.ts` 或 `ai-audit/schemas.ts` 必填**）

CI 會在 PR 上 highlight 此情況，但這裡也手動確認：

- [ ] **動到 prompt 文字** → 對應 `PromptEntry.version` 已 bump（semver-ish）
- [ ] **新增 prompt entry** → `key` 用 `領域.用途` 格式（如 `quality_audit.holistic_judge`）
- [ ] **動到 Zod schema** → caller 端有對應 fallback，未測過的失敗路徑已補
- [ ] **動到 `GROUNDING_SUFFIX`** → 確認對所有 3 個 LLM service（quality-audit / withdrawal-risk / platform-health）都沒副作用
- [ ] **`prompts.test.ts` / `schemas.test.ts` 是否同步更新**

## Test plan

- [ ] tsc 通過
- [ ] vitest 全綠
- [ ] （若 UI 改動）playwright 影響範圍跑過
- [ ] 手動 smoke 測過主要 flow

---

🤖 _此 template 由 Phase II.7 (commit pending) 建立。動到 AI 區塊請務必走完上方 checklist。_
