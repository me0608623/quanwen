# 券問 QuanWen — Mobile (Expo / React Native)

受試者（respondent）MVP：Email 註冊/登入、可填問卷列表、詳情作答、提交、填答紀錄。

對接既有 NestJS API（`/api/v1`），**不發明端點**。

## 環境變數

複製 `.env.example` → `.env`：

```bash
cp .env.example .env
```

| 變數 | 說明 |
|------|------|
| `EXPO_PUBLIC_API_URL` | API 根路徑，需含 `/api/v1`。預設 `http://10.0.2.2:3001/api/v1`（Android 模擬器連本機） |

實體裝置請改成區網 IP，例如 `http://192.168.1.10:3001/api/v1`。正式環境可指到 `https://quanwen-api.onrender.com/api/v1`。

先在 monorepo 根目錄啟動 API：

```bash
# 從 repo root
pnpm --filter api start:dev   # 或專案既有的 api 啟動指令
```

## 開發（Expo）

```bash
# 從 repo root
pnpm --filter mobile start
# 或
cd apps/mobile && pnpm start
```

然後用 Expo Go 掃碼，或按 `a` 開 Android 模擬器。

## Android Debug APK（prebuild + Gradle）

需要本機 JDK 17+ 與 Android SDK（`ANDROID_HOME`）。

```bash
cd apps/mobile
pnpm prebuild          # 產生 android/（已在 .gitignore）
cd android && ./gradlew assembleDebug
```

APK 通常在：

```
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

一鍵腳本（同 `package.json`）：

```bash
pnpm --filter mobile build:apk
```

## 支援題型

| API `question.type` | App 行為 |
|---------------------|----------|
| `single_choice` | 單選 |
| `multiple_choice` | 多選 |
| `text` | 文字 |
| `rating` | 1…N 評分（讀 `config.max` / `config.scale`，預設 5） |
| `matrix` | MVP 簡化為文字欄位 |

## 相關 API（真實路由）

- `POST /auth/register` · `POST /auth/login` · `GET /auth/me`
- `GET /tasks` · `GET /tasks/:id` · `POST /tasks/:id/submit` · `GET /tasks/history`

JWT：`Authorization: Bearer <token>`，token 存在 `expo-secure-store`。
