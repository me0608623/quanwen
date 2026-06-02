# Test Coverage Improvement Plan

## Current Coverage (from README)
- **API Coverage: 43.19%** (黃色)
- **Web Coverage: 6.14%** (紅色)

## Target
- **API Coverage: >= 80%** (vitest.config.ts 已設定)
- **Web Coverage: >= 70%** (vitest.config.ts 已設定)

## Priority Areas to Improve

### 1. API 後端 (apps/api)

#### Uncovered Critical Paths
- Controllers 缺少測試
- Service 層部分邏輯未測試
- Guards 和 Pipes 未測試
- Error handling 未完整覆蓋

#### Actions Needed
1. **Controller Tests**: 為所有主要 controller 寫集成測試
   - AuthController
   - ProfileController
   - SurveysController
   - ResponsesController
   - TasksController
   - WalletController
   - AdminController

2. **Service Layer Tests**: 增加業務邏輯覆蓋率
   - AuthService (已有部分)
   - ProfileService (剛修復)
   - SurveysService
   - ResponsesService
   - WalletService
   - NotificationsService

3. **Guards & Pipes**:
   - JwtAuthGuard
   - AdminGuard
   - ZodValidationPipe

### 2. Web 前端 (apps/web)

#### Uncovered Critical Paths
- 主要頁面邏輯
- hooks 和 utilities
- 錯誤處理

#### Actions Needed
1. **Page Tests**:
   - Dashboard
   - Tasks
   - Survey Editor
   - Profile
   - Wallet

2. **Hook Tests**:
   - useAuth
   - useProfile
   - useSurveys
   - useWallet
   - useNotifications

3. **Component Tests**:
   - Navbar
   - QuestionEditor
   - TagSelector
   - 其他主要組件

## Strategy

1. **Quick Wins**: 先測試核心業務邏輯（auth, profile, surveys）
2. **Integration Tests**: 測試完整的 API 端點流程
3. **Frontend Focus**: Web 覆蓋率極低（6.14%），優先提升到 50%
4. **Iterative Approach**: 每次增加 10-15% 覆蓋率

## Timeline

### Week 1-2: API 覆蓋率提升到 70%
- [x] 修復現有失敗測試 (mail, profile)
- [ ] Auth Controller + Service 完整測試
- [ ] Profile Controller + Service 完整測試
- [ ] Surveys Controller + Service 完整測試

### Week 3-4: API 覆蓋率提升到 80%+
- [ ] Responses Controller + Service
- [ ] Wallet Controller + Service
- [ ] Notifications Controller + Service
- [ ] Admin Controller + Service
- [ ] Guards 和 Pipes 測試

### Week 5-6: Web 覆蓋率提升到 50%
- [ ] 主要 hooks 測試
- [ ] Dashboard 和 Tasks 頁面測試
- [ ] Survey Editor 測試

### Week 7-8: Web 覆蓋率提升到 70%
- [ ] Profile 和 Wallet 頁面測試
- [ ] 主要組件測試
- [ ] 錯誤處理測試

## Next Steps

1. 立即開始 API 測試覆蓋率提升
2. 並行修復現有失敗測試
3. 建立持續監控機制（CI/CD）
4. 定期審查未覆蓋的關鍵路徑