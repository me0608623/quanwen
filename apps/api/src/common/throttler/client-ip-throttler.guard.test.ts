import { describe, it, expect } from 'vitest';
import { ClientIpThrottlerGuard } from './client-ip-throttler.guard';

// getTracker 只用 req,不碰 DI;用 prototype 直接測。
const tracker = (req: Record<string, unknown>) =>
  (ClientIpThrottlerGuard.prototype as unknown as {
    getTracker(r: Record<string, unknown>): Promise<string>;
  }).getTracker(req);

describe('ClientIpThrottlerGuard.getTracker', () => {
  it('1. 反向代理後:用 req.ips[0](最左 = 真實 client),非 gateway IP', async () => {
    // trust proxy 開啟後,express 會把 X-Forwarded-For 解析進 req.ips,
    // 最左是原始 client。req.ip 此時是 gateway,不該用。
    const t = await tracker({ ips: ['203.0.113.7', '172.18.0.1'], ip: '172.18.0.1' });
    expect(t).toBe('ip:203.0.113.7');
  });

  it('2. 無代理(ips 空):退回 req.ip', async () => {
    const t = await tracker({ ips: [], ip: '198.51.100.4' });
    expect(t).toBe('ip:198.51.100.4');
  });

  it('3. 不同真實 client → 不同 tracker(各自一桶,不互相牽連)', async () => {
    const a = await tracker({ ips: ['1.1.1.1', '172.18.0.1'], ip: '172.18.0.1' });
    const b = await tracker({ ips: ['2.2.2.2', '172.18.0.1'], ip: '172.18.0.1' });
    expect(a).not.toBe(b);
  });

  it('4. 完全無 IP → unknown(不丟例外)', async () => {
    const t = await tracker({});
    expect(t).toBe('ip:unknown');
  });
});
