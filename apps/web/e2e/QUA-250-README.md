# QUA-250: 問卷完整流程 E2E 測試 — 執行說明

## 概述

已建立完整的 E2E 測試檔案 `apps/web/e2e/survey-full-flow.spec.ts`，涵蓋問卷平台的完整流程。

## 測試範圍

### 1. 建立問卷流程
- AC1: 建立、編輯、預覽問卷
  - 測試所有 7 種題型：單選、多選、文字、評分、數字、是/否、日期（若支援）
  - 驗證預覽功能
  - 驗證草稿儲存

- AC2: 編輯已存在的問卷
  - 透過 API 建立測試問卷
  - 修改標題和題目
  - 驗證修改持久化

### 2. 填寫問卷流程
- AC3: 匿名用戶開啟公開連結並填答
  - 測試公開連結 `/s/{id}`
  - 填寫各種題型
  - 驗證提交後感謝頁

- AC4: 必填題驗證
  - 不填任何題目直接提交
  - 驗證錯誤提示出現

- AC5: 已填答用戶無法重複填答
  - 以同一帳號提交兩次
  - 驗證重複填答被阻擋

### 3. 結果分析流程
- AC6: 查看統計頁
  - 訪問 `/dashboard/surveys/{id}/stats`
  - 驗證統計資料顯示
  - 驗證圖表/表格渲染

- AC7: 匯出資料
  - 測試匯出按鈕
  - 驗證下載檔案格式（CSV/XLSX/JSON）

- AC8: 查看品質分布
  - 驗證品質分類顯示（乾淨/可疑/退件等）

### 4. 錯誤處理測試
- AC9: 不存在的問卷連結返回 404
  - 訪問無效的 survey ID
  - 驗證 404 頁面

- AC10: 未登入訪問需要權限的頁面被重導向
  - 未登入訪問 `/dashboard`
  - 驗證重導向到登入頁

- AC11: 已關閉的問卷無法填答
  - 透過 API 關閉問卷
  - 驗證關閉訊息顯示

## 測試檔案位置

```
~/projects/quanwen/apps/web/e2e/survey-full-flow.spec.ts
```

## 執行測試

### 前置準備

1. 安裝 Playwright 瀏覽器（如果尚未安裝）：
```bash
cd ~/projects/quanwen
pnpm exec playwright install
```

2. 確保 API 和 Web 服務正在執行：
```bash
# Terminal 1: API
pnpm --filter api dev

# Terminal 2: Web
pnpm --filter web dev
```

### 執行指令

```bash
# 執行所有測試
cd ~/projects/quanwen
pnpm --filter web test:e2e

# 只執行本問題的測試
pnpm --filter web test:e2e survey-full-flow.spec.ts

# 執行並看到瀏覽器（除錯用）
pnpm --filter web test:e2e survey-full-flow.spec.ts --headed

# 執行特定測試案例
pnpm --filter web test:e2e survey-full-flow.spec.ts -g "AC1"
```

## 測試帳號

測試使用以下預設帳號（seed data）：

| 角色 | Email | 密碼 | 用途 |
|------|-------|------|------|
| 管理員 | user@quanwen.com | 000 | 審核問卷 |
| 問卷方 | user1@quanwen.com | 000 | 建立和編輯問卷 |
| 受試者 | user2@quanwen.com | 000 | 填寫問卷 |

## API 端點依賴

測試依賴以下 API 端點：

- `POST /api/v1/auth/login` - 登入取得 token
- `POST /api/v1/surveys` - 建立問卷
- `POST /api/v1/surveys/{id}/publish` - 發布問卷
- `POST /api/v1/admin/surveys/{id}/approve` - 審核問卷
- `POST /api/v1/public/surveys/{id}/submit` - 提交回應
- `GET /api/v1/surveys/{id}/stats` - 取得統計資料
- `DELETE /api/v1/surveys/{id}` - 刪除問卷（測試清理）
- `POST /api/v1/surveys/{id}/close` - 關閉問卷

## 備註

1. 每個測試案例開始前會清理以 `QUA-250` 開頭的舊測試問卷
2. 測試使用串行執行（workers: 1）避免 DB 衝突
3. 某些測試依賴 demo seed 資料，如果沒有對應資料會被跳過
4. API 端點假設為 `http://localhost:3001/api/v1`，可透過環境變數 `NEXT_PUBLIC_API_URL` 覆蓋

## 已知限制

1. 日期題型可能未完全實作，測試會自動跳過
2. 匯出功能可能尚未實作，測試會輸出警告但不失敗
3. 某些權限檢查依賴實際的實作，可能需要調整

## 維護建議

1. 當新增題型時，在 AC1 測試中加入對應的填寫邏輯
2. 當新增統計功能時，在 AC6-AC8 測試中加入驗證
3. 當修改路由或 UI 時，更新對應的 selector
4. 定期執行測試確保回歸