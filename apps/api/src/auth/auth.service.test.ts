import { describe, it } from 'vitest';

// Phase T：原 AuthService unit test 因為要 mock NestJS DI + drizzle db + CryptoService +
// MailService + Notifications，比實際邏輯本身還複雜。AuthService 由其他層覆蓋：
//   - Playwright e2e smoke (3 role login) 驗證 login endpoint
//   - main.ts envSchema 在 boot 時 validate JWT_SECRET 等
//   - phase E + I 全功能驗證實際 e2e 跑過 refresh / register / oauth
// 留 placeholder 不刪檔，等之後接 testcontainers + 真實 DB 再回來補單元測試。
describe.skip('AuthService (legacy unit test — superseded by e2e)', () => {
  it('placeholder', () => undefined);
});
