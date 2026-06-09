import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { DB } from '../db/index.js';
import type { AppDb } from '../db/index.js';
import { systemConfig } from '../db/schema/index.js';

export const CONFIG_KEYS = {
  PLATFORM_FEE_RATE: 'platform_fee_rate',
  POINTS_VALUE_NTD: 'points_value_ntd',
  MIN_WITHDRAWAL_NTD: 'min_withdrawal_ntd',
  MAX_DAILY_WITHDRAWAL_NTD: 'max_daily_withdrawal_ntd',
  MIN_DEPOSIT_NTD: 'min_deposit_ntd',
  MAX_DEPOSIT_NTD: 'max_deposit_ntd',
} as const;

const CONFIG_DEFAULTS: Record<string, string> = {
  [CONFIG_KEYS.PLATFORM_FEE_RATE]: '0.10',
  [CONFIG_KEYS.POINTS_VALUE_NTD]: '0.5',
  [CONFIG_KEYS.MIN_WITHDRAWAL_NTD]: '300',
  [CONFIG_KEYS.MAX_DAILY_WITHDRAWAL_NTD]: '30000',
  [CONFIG_KEYS.MIN_DEPOSIT_NTD]: '100',
  [CONFIG_KEYS.MAX_DEPOSIT_NTD]: '100000',
};

export const CONFIG_DESCRIPTIONS: Record<string, string> = {
  [CONFIG_KEYS.PLATFORM_FEE_RATE]: '平台手續費率（如 0.10 = 10%）',
  [CONFIG_KEYS.POINTS_VALUE_NTD]: '1 積分兌換 NT$ 值',
  [CONFIG_KEYS.MIN_WITHDRAWAL_NTD]: '最低提領金額（NT$）',
  [CONFIG_KEYS.MAX_DAILY_WITHDRAWAL_NTD]: '每日最高提領金額（NT$）',
  [CONFIG_KEYS.MIN_DEPOSIT_NTD]: '最低存款金額（NT$）',
  [CONFIG_KEYS.MAX_DEPOSIT_NTD]: '最高存款金額（NT$）',
};

const CACHE_TTL_MS = 60_000;

@Injectable()
export class SystemConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemConfigService.name);
  private cache = new Map<string, string>(Object.entries(CONFIG_DEFAULTS));
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DB) private readonly db: AppDb) {}

  async onModuleInit(): Promise<void> {
    await this.loadCache();
    this.refreshTimer = setInterval(() => {
      this.loadCache().catch((err: unknown) =>
        this.logger.error('SystemConfig cache refresh failed', err),
      );
    }, CACHE_TTL_MS);
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async loadCache(): Promise<void> {
    const rows = await this.db.select().from(systemConfig);
    const next = new Map<string, string>(Object.entries(CONFIG_DEFAULTS));
    for (const row of rows) {
      next.set(row.key, row.value);
    }
    this.cache = next;
    this.logger.debug(`SystemConfig cache refreshed (${rows.length} rows from DB)`);
  }

  get(key: string): string {
    return this.cache.get(key) ?? CONFIG_DEFAULTS[key] ?? '';
  }

  getNumber(key: string): number {
    const raw = this.get(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number(CONFIG_DEFAULTS[key] ?? '0');
  }

  getPlatformFeeRate(): number {
    return this.getNumber(CONFIG_KEYS.PLATFORM_FEE_RATE);
  }

  getPointsValueNtd(): number {
    return this.getNumber(CONFIG_KEYS.POINTS_VALUE_NTD);
  }

  getMinWithdrawal(): number {
    return this.getNumber(CONFIG_KEYS.MIN_WITHDRAWAL_NTD);
  }

  getMaxDailyWithdrawal(): number {
    return this.getNumber(CONFIG_KEYS.MAX_DAILY_WITHDRAWAL_NTD);
  }

  getMinDeposit(): number {
    return this.getNumber(CONFIG_KEYS.MIN_DEPOSIT_NTD);
  }

  getMaxDeposit(): number {
    return this.getNumber(CONFIG_KEYS.MAX_DEPOSIT_NTD);
  }

  async set(key: string, value: string, updatedBy: string): Promise<void> {
    await this.db
      .insert(systemConfig)
      .values({ key, value, updatedAt: new Date(), updatedBy })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: { value, updatedAt: new Date(), updatedBy },
      });
    this.cache.set(key, value);
    this.logger.log(`Config updated: ${key}=${value} by user=${updatedBy.slice(0, 8)}`);
  }

  getAll(): Array<{ key: string; value: string; description: string }> {
    const merged: Record<string, string> = { ...CONFIG_DEFAULTS };
    for (const [k, v] of this.cache) {
      merged[k] = v;
    }
    return Object.entries(merged).map(([key, value]) => ({
      key,
      value,
      description: CONFIG_DESCRIPTIONS[key] ?? '',
    }));
  }
}
