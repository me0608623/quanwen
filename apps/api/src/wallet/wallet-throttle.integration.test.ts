/**
 * Issue #37 — wallet throttle integration tests
 *
 * Verifies that POST /wallet/withdraw, /wallet/ecpay/order, and /wallet/deposit
 * each enforce a limit of 5 requests per IP per minute, returning 429 with a
 * `retryAfter` field on the 6th call.
 *
 * Uses a minimal NestJS test module (no full AppModule) so the ThrottlerModule
 * has no `skipIf` override — throttling is always active here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, type ExecutionContext } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import supertest from 'supertest';

import { WalletController, EcpayWebhookController } from './wallet.controller';
import { AppThrottlerGuard } from '../common/throttler/app-throttler.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { CouponsService } from './coupons.service';

const MOCK_USER = { id: 'test-user-id', email: 'test@quanwen.com', role: 'respondent' };

class MockJwtGuard {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest<{ user: unknown }>().user = MOCK_USER;
    return true;
  }
}

const mockWalletService = {
  requestWithdrawal: vi.fn().mockResolvedValue({ transactionId: 'test-txn' }),
  createEcpayOrder: vi.fn().mockResolvedValue('<html>form</html>'),
  mockDeposit: vi.fn().mockResolvedValue(undefined),
  processEcpayCallback: vi.fn().mockResolvedValue('1|OK'),
};

const mockCouponsService = {
  listForUser: vi.fn().mockResolvedValue([]),
};

async function buildApp(): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        // Mirror production names; individual endpoints override medium to limit:5
        throttlers: [
          { name: 'short', ttl: 1_000, limit: 30 },
          { name: 'medium', ttl: 60_000, limit: 100 },
        ],
        // No skipIf — throttling must be active in these tests.
      }),
    ],
    controllers: [WalletController, EcpayWebhookController],
    providers: [
      { provide: APP_GUARD, useClass: AppThrottlerGuard },
      { provide: WalletService, useValue: mockWalletService },
      { provide: CouponsService, useValue: mockCouponsService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useClass(MockJwtGuard)
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

const WITHDRAW_BODY = {
  amount: 300,
  bankCode: '700',
  bankAccount: '7001234567890',
  accountName: 'Test User',
};
const DEPOSIT_BODY = { amount: 500 };

describe('Wallet throttle — 5 req/min per IP', () => {
  let app: INestApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Fresh app per test so in-memory throttle counters reset.
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /wallet/withdraw — first 5 pass, 6th returns 429 with retryAfter', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await supertest(app.getHttpServer())
        .post('/wallet/withdraw')
        .send(WITHDRAW_BODY);
      expect(res.status, `request ${i + 1} should not be throttled`).not.toBe(429);
    }

    const res = await supertest(app.getHttpServer())
      .post('/wallet/withdraw')
      .send(WITHDRAW_BODY);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      message: 'Too Many Requests',
      retryAfter: expect.any(Number),
    });
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  it('POST /wallet/ecpay/order — first 5 pass, 6th returns 429 with retryAfter', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await supertest(app.getHttpServer())
        .post('/wallet/ecpay/order')
        .send(DEPOSIT_BODY);
      expect(res.status, `request ${i + 1} should not be throttled`).not.toBe(429);
    }

    const res = await supertest(app.getHttpServer())
      .post('/wallet/ecpay/order')
      .send(DEPOSIT_BODY);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      message: 'Too Many Requests',
      retryAfter: expect.any(Number),
    });
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  it('POST /wallet/deposit — first 5 pass, 6th returns 429 with retryAfter', async () => {
    // NODE_ENV=test so the prod guard (ForbiddenException) does not fire.
    for (let i = 0; i < 5; i++) {
      const res = await supertest(app.getHttpServer())
        .post('/wallet/deposit')
        .send(DEPOSIT_BODY);
      expect(res.status, `request ${i + 1} should not be throttled`).not.toBe(429);
    }

    const res = await supertest(app.getHttpServer())
      .post('/wallet/deposit')
      .send(DEPOSIT_BODY);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      message: 'Too Many Requests',
      retryAfter: expect.any(Number),
    });
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });
});
