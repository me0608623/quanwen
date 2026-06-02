# QUA-250: 問卷完整流程 E2E 測試

## 已完成工作

1. ✅ 建立 `apps/web/e2e/survey-full-flow.spec.ts` 完整 E2E 測試檔案
2. ✅ 涵蓋 11 個測試案例（AC1-AC11）
3. ✅ 建立執行說明文件 `e2e/QUA-250-README.md`

## 測試覆蓋範圍

### 建立問卷流程
- AC1: 建立、編輯、預覽問卷（含 7 種題型）
- AC2: 編輯已存在的問卷

### 填寫問卷流程
- AC3: 匿名用戶開啟公開連結並填答
- AC4: 必填題驗證
- AC5: 已填答用戶無法重複填答

### 結果分析流程
- AC6: 查看統計頁
- AC7: 匯出資料
- AC8: 查看品質分布

### 錯誤處理測試
- AC9: 不存在的問卷連結返回 404
- AC10: 未登入訪問需要權限的頁面被重導向
- AC11: 已關閉的問卷無法填答

## 執行測試

```bash
# 前置：安裝 Playwright 瀏覽器
cd ~/projects/quanwen
pnpm exec playwright install

# 執行完整測試套件
pnpm --filter web test:e2e survey-full-flow.spec.ts
```

詳細說明請參考 `apps/web/e2e/QUA-250-README.md`