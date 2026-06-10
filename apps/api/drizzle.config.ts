import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  // strict 會在 push 前多一道「確認?」prompt。部署管線（render-api-deploy.yml）非互動跑 push，
  // 設 DRIZZLE_PUSH_NONINTERACTIVE=true 關掉它 → 純新增自動套用；破壞性語句仍會 prompt，CI 收到 EOF → 中止部署交人工審。
  // 本機未設此 env 時維持 strict=true（push 前仍會確認）。
  strict: process.env.DRIZZLE_PUSH_NONINTERACTIVE !== 'true',
});
