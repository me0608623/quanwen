# Evolution Ledger — QuanWen

> 由 Evolution Scout 維護，記錄所有評估過的開源專案。
> 每次掃描前先讀取此檔案以避免重複評估。

## 評估準則

- 與 QuanWen 問卷媒合平台的技術棧（NestJS, Next.js, Drizzle ORM, PGlite）相關性
- 與業務領域（問卷、表單、獎勵、反作弊、AI 品質審核）相關性
- 社群動能（星星數、活躍度、fork 數）

---

## 掃描記錄

### 第 1 週 — 2026-05-31

| # | Repo | Stars | Forks | 最後更新 | 領域 | 相關性 | 提案 |
|---|------|-------|-------|----------|------|--------|------|
| 1 | heyform/heyform | 8,779 | 683 | 2026-05-28 | 開源表單建構器 | **高** — 問卷/表單核心功能 | 建議提案 |
| 2 | surveyjs/survey-library | 4,762 | 905 | 2026-05-30 | 問卷 JS 函式庫 | **高** — 問卷引擎可直接嵌入 | 建議提案 |
| 3 | alibaba/formily | 12,544 | 1,597 | 2025-06-21 | 跨平台動態表單 | 中 — 技術成熟但更新不活躍 | 觀察 |
| 4 | baptisteArno/typebot.io | 9,974 | 3,095 | 2026-05-28 | 聊天機器人建構器 | 中 — 可參考互動式問卷模式 | 觀察 |
| 5 | electric-sql/pglite | 15,316 | 387 | 2026-05-29 | 嵌入式 Postgres | **高** — 已採用，持續關注更新 | 觀察 |
| 6 | paperclipai/paperclip | 68,355 | 12,640 | 2026-05-30 | AI Agent 管理 | 低 — 公司管理工具，非產品相關 | 跳過 |
| 7 | Ryczko/FormsLab | 548 | 72 | 2026-02-14 | 匿名問卷/投票 | 中 — 但星星少且更新不活躍 | 觀察 |
| 8 | chenglou/pretext | 47,971 | 2,676 | 2026-05-23 | 文字測量/排版 | 低 — 前端排版工具 | 跳過 |
| 9 | KeygraphHQ/shannon | 43,999 | 5,079 | 2026-05-28 | AI 滲透測試 | 低 — 安全測試 | 跳過 |
| 10 | mlflow/mlflow | 26,202 | — | — | AI/ML 實驗管理 | 低 — ML 相關 | 跳過 |

#### 掃描範圍
- GitHub 搜尋：TypeScript 新星（2025-05+）、問卷/表單相關、Drizzle/PGlite 相關、AI 品質審核、反作弊
- 搜尋時間：2026-05-31

#### 主要發現
本次掃描識別出兩個高相關性專案值得進一步評估：
1. **heyform/heyform** — 開源表單建構器，TypeScript，可參考問卷 UI 和表單引擎設計
2. **surveyjs/survey-library** — 專業問卷 JS 函式庫，活躍維護，可直接作為問卷引擎參考或整合基礎

---

## 分析完成

### 第 1 週 分析進度 (2026-05-31)

#### heyform/heyform ✅ 分析完成
- **結論:** 有條件核准 (CONDITIONAL APPROVE)
- **使用方式:** 參考實作 (Reference-only)
- **原因:** AGPL-3.0 授權限制 — 若整合代碼須開源所有修改
- **建議:** 作為條件表單邏輯系統的參考架構，獨立在 QuanWen 中實現
- **工程預估:** 4-6 週實現核心功能
- **分析報告:** `QUA-evolution-heyform-analysis.md` (已發表至 QUA-19)

#### surveyjs/survey-library ✅ 分析完成
- **結論:** 核准整合 (APPROVE FOR INTEGRATION)
- **使用方式:** 直接整合 React 元件
- **原因:** MIT 授權 — 商用友善，無智財權風險
- **建議:** 作為問卷引擎基礎，嵌入 QuanWen
- **工程預估:** 2-3 週整合，節省 ~4 週開發時間
- **分析報告:** `QUA-evolution-surveyjs-analysis.md` (已發表至 QUA-19)

#### 後續行動
- 建立 QUA-202: 評估 surveyjs 整合原型
- 建立 QUA-203: 使用 heyform 作為進階功能參考實作
- 工程團隊決定：整合 vs 自建
