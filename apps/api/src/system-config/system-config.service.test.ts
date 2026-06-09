import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemConfigService, CONFIG_KEYS } from './system-config.service.js';
import type { AppDb } from '../db/index.js';

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  const makeSelectBuilder = (rows: Array<{ key: string; value: string }>) => ({
    from: vi.fn().mockResolvedValue(rows),
  });

  const makeInsertBuilder = () => ({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
    };
    mockDb.select.mockReturnValue(makeSelectBuilder([]));
    mockDb.insert.mockReturnValue(makeInsertBuilder());

    service = new SystemConfigService(mockDb as unknown as AppDb);
    await service.onModuleInit();
    service.onModuleDestroy();
  });

  it('returns default values when DB has no rows', () => {
    expect(service.getPlatformFeeRate()).toBe(0.1);
    expect(service.getPointsValueNtd()).toBe(0.5);
    expect(service.getMinWithdrawal()).toBe(300);
    expect(service.getMaxDailyWithdrawal()).toBe(30000);
    expect(service.getMinDeposit()).toBe(100);
    expect(service.getMaxDeposit()).toBe(100000);
  });

  it('overrides defaults with DB values on init', async () => {
    mockDb.select.mockReturnValue(makeSelectBuilder([
      { key: CONFIG_KEYS.PLATFORM_FEE_RATE, value: '0.05' },
      { key: CONFIG_KEYS.MIN_WITHDRAWAL_NTD, value: '500' },
    ]));

    const svc = new SystemConfigService(mockDb as unknown as AppDb);
    await svc.onModuleInit();
    svc.onModuleDestroy();

    expect(svc.getPlatformFeeRate()).toBe(0.05);
    expect(svc.getMinWithdrawal()).toBe(500);
    expect(svc.getMaxDailyWithdrawal()).toBe(30000); // still default
  });

  it('set() updates DB and cache immediately', async () => {
    await service.set(CONFIG_KEYS.MIN_WITHDRAWAL_NTD, '500', 'user-id-abc');

    expect(mockDb.insert).toHaveBeenCalled();
    expect(service.getMinWithdrawal()).toBe(500);
  });

  it('getAll() returns all known keys with descriptions', () => {
    const all = service.getAll();
    const keys = all.map((r) => r.key);

    expect(keys).toContain(CONFIG_KEYS.PLATFORM_FEE_RATE);
    expect(keys).toContain(CONFIG_KEYS.MIN_WITHDRAWAL_NTD);
    expect(keys).toContain(CONFIG_KEYS.MAX_DEPOSIT_NTD);
    expect(all.find((r) => r.key === CONFIG_KEYS.PLATFORM_FEE_RATE)?.description).toBeTruthy();
  });

  it('falls back to default if DB value is invalid number', async () => {
    mockDb.select.mockReturnValue(makeSelectBuilder([
      { key: CONFIG_KEYS.PLATFORM_FEE_RATE, value: 'not-a-number' },
    ]));

    const svc = new SystemConfigService(mockDb as unknown as AppDb);
    await svc.onModuleInit();
    svc.onModuleDestroy();

    expect(svc.getPlatformFeeRate()).toBe(0.1);
  });
});
