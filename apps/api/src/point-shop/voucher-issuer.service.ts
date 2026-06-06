import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';

export interface IssueVoucherInput {
  itemName: string;
  faceValue: number;   // NT$
  category: string;    // voucher_711 | voucher_familymart | ...
  redemptionRef?: string;
}

export interface IssuedVoucher {
  /** 兌換碼 / PIN / 序號 / 兌換連結 — 顯示給用戶 */
  code: string;
  /** 票券到期時間（供應商決定）；null = 沿用平台預設 6 個月 */
  expiresAt: Date | null;
  /** 供應商交易序號，稽核對帳用 */
  providerRef: string | null;
}

/**
 * 禮券發放抽象層。
 *
 * 預設 `demo`：產生隨機 PIN（雛形/測試用，不串外部）。
 * 設定 `VOUCHER_PROVIDER=http` + `VOUCHER_API_URL`（+ `VOUCHER_API_KEY`）後改打真實供應商 REST API。
 *
 * 為何用抽象層：真實便利商店禮券需向供應商（如 Edenred 好禮即享券 for business、
 * GiftPay、ibon 企業採購等）簽約取得 API。簽約拿到端點 + 金鑰後，只要設 env 切換，
 * 不需改兌換流程。HTTP provider 失敗時**丟例外**（讓兌換交易回滾、不扣點），
 * 絕不退回假碼給用戶。
 */
@Injectable()
export class VoucherIssuerService {
  private readonly logger = new Logger(VoucherIssuerService.name);
  private readonly provider = (process.env.VOUCHER_PROVIDER ?? 'demo').toLowerCase();
  private readonly apiUrl = process.env.VOUCHER_API_URL ?? '';
  private readonly apiKey = process.env.VOUCHER_API_KEY ?? '';

  async issue(input: IssueVoucherInput): Promise<IssuedVoucher> {
    if (this.provider === 'http' && this.apiUrl) {
      return this.issueViaHttp(input);
    }
    if (this.provider === 'http' && !this.apiUrl) {
      this.logger.warn('VOUCHER_PROVIDER=http 但未設定 VOUCHER_API_URL，退回 demo 發碼');
    }
    return this.issueDemo();
  }

  /** demo：隨機 4 段 4 位數字 PIN，預設 6 個月效期 */
  private issueDemo(): IssuedVoucher {
    const seg = () => (parseInt(randomBytes(2).toString('hex'), 16) % 10000).toString().padStart(4, '0');
    return {
      code: `${seg()}-${seg()}-${seg()}-${seg()}`,
      expiresAt: null,
      providerRef: null,
    };
  }

  /**
   * 真實供應商 REST 發券。請求/回應欄位以常見規格為預設，實際串接時依供應商文件調整 mapping。
   * 預設請求 body：{ sku, faceValue, quantity, reference }；回應取 code/pin/voucherCode、expiresAt/expireAt。
   */
  private async issueViaHttp(input: IssueVoucherInput): Promise<IssuedVoucher> {
    const sku = process.env.VOUCHER_SKU_PREFIX
      ? `${process.env.VOUCHER_SKU_PREFIX}${input.category}_${input.faceValue}`
      : `${input.category}_${input.faceValue}`;
    let res: Response;
    try {
      res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          sku,
          faceValue: input.faceValue,
          category: input.category,
          quantity: 1,
          reference: input.redemptionRef ?? null,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      this.logger.error('禮券供應商請求失敗（網路/逾時）', err as Error);
      throw new ServiceUnavailableException('禮券供應商暫時無法發券，請稍後再試（未扣點）');
    }

    if (!res.ok) {
      this.logger.error(`禮券供應商回應錯誤 ${res.status}`);
      throw new ServiceUnavailableException('禮券供應商發券失敗，請稍後再試（未扣點）');
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = String(data.code ?? data.pin ?? data.voucherCode ?? data.redeemCode ?? '').trim();
    if (!code) {
      this.logger.error('禮券供應商回應缺少兌換碼欄位');
      throw new ServiceUnavailableException('禮券供應商回應格式異常，請稍後再試（未扣點）');
    }
    const rawExpiry = data.expiresAt ?? data.expireAt ?? data.expiryDate;
    const expiresAt = typeof rawExpiry === 'string' && !Number.isNaN(Date.parse(rawExpiry))
      ? new Date(rawExpiry)
      : null;
    const providerRef = data.transactionId || data.orderId || data.ref
      ? String(data.transactionId ?? data.orderId ?? data.ref)
      : null;
    return { code, expiresAt, providerRef };
  }
}
