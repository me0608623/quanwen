import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 反向代理感知的限流 Guard。
 *
 * 問題:預設 ThrottlerGuard.getTracker 回 `req.ip`。本服務部署在
 * Cloudflare Tunnel / web proxy 之後,未開 trust proxy 時 `req.ip` 會是
 * 內網 gateway(如 172.18.0.1),導致**所有真實使用者共用同一個限流桶**——
 * 一個人打滿全站被擋。
 *
 * 解法(搭配 main.ts 的 `set('trust proxy', true)`):
 * - express 開 trust proxy 後,會把 X-Forwarded-For 解析進 `req.ips`,
 *   最左元素為原始 client IP。
 * - 這裡優先取 `req.ips[0]`(真實 client),退回 `req.ip`,皆無則 'unknown'。
 *
 * 註:per-user 桶(對已登入請求用 userId)目前不做——全域 ThrottlerGuard
 * 在 JwtAuthGuard 之前執行,此時尚無 req.user;在 guard 內驗 JWT 的成本與
 * 複雜度不划算。以真實 client IP 分桶已修正「共用 gateway IP」的核心問題。
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ips = Array.isArray(req.ips) ? (req.ips as string[]) : [];
    const ip = (ips.length > 0 ? ips[0] : (req.ip as string | undefined)) ?? 'unknown';
    return `ip:${ip}`;
  }
}
