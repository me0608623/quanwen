# 券問（QuanWen）實作與功能細節文件

> 本目錄記錄券問平台**目前程式碼中實際存在**的實作與功能細節，由原始碼盤點整理而成（非規劃文件）。
> 最後更新：2026-06-15

## 這是什麼

券問是一個**雙角色問卷調查平台**：同一帳號既能發問卷（問券方 surveyor），也能填問卷（受試者 respondent）。受試者填答通過品質審核後可獲得現金獎勵或抽獎資格；問券方付費取得高品質樣本與 AI 分析。

- 正式站前端：https://quanwen.vercel.app（Vercel）
- 正式站 API：https://quanwen-api.onrender.com（Render）
- 資料庫：Neon serverless PostgreSQL

## 技術架構

| 層 | 技術 | 說明 |
|----|------|------|
| 前端 | Next.js 14 App Router | `apps/web`，port 3000 |
| 後端 | NestJS 10 | `apps/api`，port 3001，全部業務邏輯 |
| ORM | Drizzle | 支援 PGlite in-memory 與真實 PostgreSQL 雙模式 |
| 共用型別 | `packages/shared-types` | 前後端共享 TypeScript 型別 |
| 報告引擎 | `packages/report-generator` | AI 報告生成框架 |
| 前端資料層 | TanStack Query + axios | `src/hooks/use-*.ts` + `src/lib/api.ts` |
| 問卷渲染 | SurveyJS | `surveyjs-adapter` 把券問題型轉 SurveyJS model |
| AI | Z.ai GLM-5.1 / GLM-4.6 | `ai-audit/ZaiClient`，雙層 cache |
| 金流 | ECPay（綠界） | 儲值；提領走人工審核 |

## 文件導覽

| 文件 | 內容 |
|------|------|
| [01-認證與使用者.md](./01-認證與使用者.md) | 登入註冊、JWT、OAuth（Google/LINE/Apple）、帳號綁定、密碼政策、VIP/VVIP 方案、KYC、common 層橫切關注點 |
| [02-問卷與填答.md](./02-問卷與填答.md) | 問卷 CRUD、狀態機、發布流程、品質審核三層管線、統計分析、匯出格式、AI 洞察報告 |
| [03-金流與帳務.md](./03-金流與帳務.md) | 雙向記帳、預算鎖定/解鎖/發獎、ECPay、提領、互惠配對、轉盤、積分商城、對帳 |
| [04-AI與後台.md](./04-AI與後台.md) | ZaiClient、AI 額度系統、prompt 版本化、admin 端點、通知系統、寄信、申訴 |
| [05-資料庫與前端.md](./05-資料庫與前端.md) | 完整資料表清單與 enum、雙模式 DB、Web 頁面地圖、前端 hooks、SurveyJS 元件 |

## 相關文件（docs 其他位置）

- `docs/evolution-ledger.md` — 演進帳本（迭代歷史與決策軌跡）
- `docs/decisions/` — ADR 架構決策紀錄（優惠券、VIP 方案、抽獎保證）
- `docs/prd/` — 產品需求文件
- `docs/spikes/` — 技術探針（如 ZenStack RBAC）
- `docs/quanwen_obi/` — Obsidian 知識庫（產品願景、技術架構、系統深度設計）
- `docs/FREE_DEPLOYMENT_VERCEL_RENDER.md` — 免費部署指南
- `docs/archive/` — 已封存的單次性 QA / schema review 文件
- 專案根 `CLAUDE.md` — 開發者指引與部署 SOP
- 專案根 `README.md` — 完整 DB schema、API 端點、sprint 歷史

## 關鍵數值速查

| 項目 | 值 |
|------|-----|
| 平台手續費率 | 10%（2026-06-07 由 15% 調降，`PLATFORM_FEE_RATE = 0.10`） |
| 單份成本公式 | `reward + ceil(reward × 0.10)`（逐份進位） |
| 最低/最高提領 | NT$300 / NT$30,000 每日 |
| ECPay 儲值限額 | NT$100 ～ NT$100,000 |
| KYC 觸發門檻 | 提領 ≥ NT$2,000 |
| 積分面值 | 1 點 ≈ NT$0.5（顯示用） |
| 互惠配對超時 | 72 小時 |
| AI 每日額度 | Free 5 / VIP 50 / VVIP 無限（註：程式另有 free=3 的舊常數，以 service 為準） |
| VIP / VVIP 月費 | NT$490 / NT$1290 |
| 積分兌換 VIP | 500 點 → 7 天 VIP |
| 品質分數門檻 | ≥80 通過、50-79 可疑、<50 退件 |
