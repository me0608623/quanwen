import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { VoucherIssuerService } from './voucher-issuer.service';

const ENV_KEYS = ['VOUCHER_PROVIDER', 'VOUCHER_API_URL', 'VOUCHER_API_KEY', 'VOUCHER_SKU_PREFIX'];
const saved: Record<string, string | undefined> = {};

function makeService() {
  return new VoucherIssuerService();
}

describe('VoucherIssuerService', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  it('demo provider 產生 4 段 PIN 格式、無到期/序號', async () => {
    const svc = makeService();
    const r = await svc.issue({ itemName: '7-11 100', faceValue: 100, category: 'voucher_711' });
    expect(r.code).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    expect(r.expiresAt).toBeNull();
    expect(r.providerRef).toBeNull();
  });

  it('http provider 未設 URL → 退回 demo', async () => {
    process.env.VOUCHER_PROVIDER = 'http';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await makeService().issue({ itemName: 'x', faceValue: 100, category: 'voucher_711' });
    expect(r.code).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('http provider 成功：打正確端點、帶 Bearer、解析 code/expiresAt/ref', async () => {
    process.env.VOUCHER_PROVIDER = 'http';
    process.env.VOUCHER_API_URL = 'https://supplier.example/issue';
    process.env.VOUCHER_API_KEY = 'sk-test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'ABC-123', expiresAt: '2027-01-01T00:00:00Z', transactionId: 'tx_9' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await makeService().issue({ itemName: '全家 200', faceValue: 200, category: 'voucher_familymart' });
    expect(r.code).toBe('ABC-123');
    expect(r.expiresAt?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(r.providerRef).toBe('tx_9');
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://supplier.example/issue');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(opts.body as string)).toMatchObject({ faceValue: 200, category: 'voucher_familymart', quantity: 1 });
  });

  it('http provider 非 2xx → 丟 ServiceUnavailable（不發碼）', async () => {
    process.env.VOUCHER_PROVIDER = 'http';
    process.env.VOUCHER_API_URL = 'https://supplier.example/issue';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 502 }));
    await expect(makeService().issue({ itemName: 'x', faceValue: 100, category: 'voucher_711' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('http provider 回應缺兌換碼 → 丟 ServiceUnavailable', async () => {
    process.env.VOUCHER_PROVIDER = 'http';
    process.env.VOUCHER_API_URL = 'https://supplier.example/issue';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(makeService().issue({ itemName: 'x', faceValue: 100, category: 'voucher_711' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('http provider 網路錯誤 → 丟 ServiceUnavailable', async () => {
    process.env.VOUCHER_PROVIDER = 'http';
    process.env.VOUCHER_API_URL = 'https://supplier.example/issue';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(makeService().issue({ itemName: 'x', faceValue: 100, category: 'voucher_711' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
