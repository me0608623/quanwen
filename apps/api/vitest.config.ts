import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Force NODE_ENV=test so production guards (e.g. PII_ENCRYPTION_KEY check) don't
    // fire when the parent process runs with NODE_ENV=production (e.g. Paperclip runtime).
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/db/seed.ts', 'src/main.ts'],
      // 設定 80% 覆蓋率閾值
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      // 暫時不強制要求所有文件都達標，避免阻擋開發
      perFile: false,
    },
  },
});
