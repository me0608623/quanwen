import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export interface EcpayOrderParams {
  merchantTradeNo: string; // unique, max 20 chars
  amount: number;          // integer NT$
  itemName: string;
  returnUrl: string;       // ECPay callback URL (server-side)
  clientBackUrl: string;   // user return URL after payment
}

@Injectable()
export class EcpayService {
  private readonly logger = new Logger(EcpayService.name);

  private get merchantId() { return process.env.ECPAY_MERCHANT_ID ?? ''; }
  private get hashKey()     { return process.env.ECPAY_HASH_KEY ?? ''; }
  private get hashIV()      { return process.env.ECPAY_HASH_IV ?? ''; }
  private get paymentUrl()  {
    return process.env.ECPAY_PAYMENT_URL ?? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
  }

  // ─── Generate CheckMacValue ───────────────────────────────────────────────

  computeCheckMac(params: Record<string, string>): string {
    // 1. Sort params alphabetically, exclude CheckMacValue
    const sorted = Object.entries(params)
      .filter(([k]) => k !== 'CheckMacValue')
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // 2. Build raw string: HashKey=...&k=v&...&HashIV=...
    const raw = `HashKey=${this.hashKey}&${sorted.map(([k, v]) => `${k}=${v}`).join('&')}&HashIV=${this.hashIV}`;

    // 3. URL-encode (lowercase), then SHA256, then uppercase
    const encoded = encodeURIComponent(raw)
      .replace(/%20/g, '+')
      .toLowerCase();

    return createHash('sha256').update(encoded).digest('hex').toUpperCase();
  }

  verifyCheckMac(params: Record<string, string>): boolean {
    const received = params.CheckMacValue;
    if (!received) return false;
    const expected = this.computeCheckMac(params);
    return received.toUpperCase() === expected.toUpperCase();
  }

  // ─── Build ECPay form HTML (POST form submit) ─────────────────────────────

  buildPaymentForm(order: EcpayOrderParams): string {
    const now = new Date();
    const tradeDate = now.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).replace(/\//g, '/'); // ECPay format: yyyy/MM/dd HH:mm:ss

    const params: Record<string, string> = {
      MerchantID: this.merchantId,
      MerchantTradeNo: order.merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: String(order.amount),
      TradeDesc: encodeURIComponent('券問平台儲值'),
      ItemName: order.itemName,
      ReturnURL: order.returnUrl,
      ClientBackURL: order.clientBackUrl,
      ChoosePayment: 'ALL',
      EncryptType: '1',
    };

    params.CheckMacValue = this.computeCheckMac(params);

    const escAttr = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const fields = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${escAttr(k)}" value="${escAttr(v)}">`)
      .join('\n');

    return `<!DOCTYPE html><html><body>
<form id="ecpay" action="${escAttr(this.paymentUrl)}" method="POST">${fields}</form>
<script>document.getElementById('ecpay').submit();</script>
</body></html>`;
  }

  // ─── Parse callback from ECPay (server-side POST) ─────────────────────────

  parseCallback(body: Record<string, string>): {
    merchantTradeNo: string;
    rtnCode: string;      // '1' = success
    rtnMsg: string;
    tradeNo: string;      // ECPay's own trade no
    tradeAmt: number;
    valid: boolean;
  } {
    if (!this.merchantId) {
      throw new BadRequestException('ECPay 未設定');
    }
    const valid = this.verifyCheckMac(body);
    return {
      merchantTradeNo: body.MerchantTradeNo ?? '',
      rtnCode: body.RtnCode ?? '0',
      rtnMsg: body.RtnMsg ?? '',
      tradeNo: body.TradeNo ?? '',
      tradeAmt: Number(body.TradeAmt ?? 0),
      valid,
    };
  }
}
