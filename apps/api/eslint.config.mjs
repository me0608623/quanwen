// apps/api ESLint flat config（ESLint 9+/10 只吃 flat config）。
// 由 .eslintrc.cjs 遷移而來，維持「可通過的寬鬆 lint 基線」：
// - @typescript-eslint/parser 解析 TS；型別檢查交給 tsc（type-check job 已涵蓋）。
// - 不引入 @eslint/js（非本專案相依，避免新增 dep + 動 lockfile）；只啟用少量噪音規則為 warn。
// - 註冊 @typescript-eslint plugin 以「定義」程式中 eslint-disable 引用的規則名，規則本身設 off。
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  // 全域 ignore（等同舊 ignorePatterns）— 只 lint TS 原始碼
  {
    ignores: ['dist/**', 'node_modules/**', 'drizzle/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  },
  {
    files: ['{src,test}/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-control-regex': 'off',
      'no-async-promise-executor': 'warn',
      'no-prototype-builtins': 'warn',
    },
  },
];
