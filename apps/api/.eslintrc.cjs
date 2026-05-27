/**
 * apps/api ESLint 設定。
 *
 * 之前 apps/api 完全沒有 eslint config → `pnpm --filter api lint` 直接 fatal（exit 2），
 * CI 的 Type-check/Lint/Audit job 長期紅燈。這份建立一個可通過的 lint 基線：
 * - 用 @typescript-eslint/parser 解析 TS（不依賴 @typescript-eslint plugin，避免缺套件）。
 * - 型別相關檢查交給 tsc（type-check job 已涵蓋），故關掉與 TS 重複/誤報的 base 規則。
 * - 噪音規則降為 warn（lint script 沒有 --max-warnings，warning 不會讓 job 失敗）。
 * 之後要收緊（裝 @typescript-eslint plugin、開 type-aware 規則）可另開一輪。
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'node_modules', 'drizzle', '*.js', '*.cjs', '*.mjs'],
  rules: {
    // tsc 已處理；base no-unused-vars 對 TS 型別/enum 會誤報
    'no-unused-vars': 'off',
    // TS 的型別、globals（NodeJS 等）會被 no-undef 誤判
    'no-undef': 'off',
    // 載入 @typescript-eslint plugin 只為了「定義」這些規則（程式裡有 eslint-disable
    // 註解引用它們，未定義會報 unknown-rule error）。規則本身設 off：本專案刻意用
    // require()（var-requires）與少量 any。之後要收緊可改開 plugin:@typescript-eslint/recommended。
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    // 以下降為 warn：不阻擋 CI，但保留提示
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-useless-escape': 'warn',
    'no-constant-condition': ['warn', { checkLoops: false }],
    'no-control-regex': 'off',
    'no-async-promise-executor': 'warn',
    'no-prototype-builtins': 'warn',
  },
};
