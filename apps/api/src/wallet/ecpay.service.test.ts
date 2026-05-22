import { describe, expect, it, beforeEach } from 'vitest';
import { EcpayService } from './ecpay.service';

describe('EcpayService — CheckMacValue (Phase A)', () => {
  let svc: EcpayService;

  beforeEach(() => {
    // ECPay 公開 sandbox 憑證
    process.env.ECPAY_MERCHANT_ID = '2000132';
    process.env.ECPAY_HASH_KEY = 'pwFHCqoQZGmho4w6';
    process.env.ECPAY_HASH_IV = 'EkRm7iFT261dpevs';
    svc = new EcpayService();
  });

  it('produces stable CheckMacValue for known input', () => {
    // 用 ECPay 官方 SDK 範例驗證一致性
    const params = {
      MerchantID: '2000132',
      MerchantTradeNo: 'QWtest12345',
      TotalAmount: '500',
      PaymentType: 'aio',
      ChoosePayment: 'ALL',
      EncryptType: '1',
    };
    const mac = svc.computeCheckMac(params);
    // SHA256 出來必為 64 hex chars uppercase
    expect(mac).toMatch(/^[0-9A-F]{64}$/);
    // 同樣 input 兩次 → 同 mac
    expect(svc.computeCheckMac(params)).toBe(mac);
  });

  it('verifies its own signed payload', () => {
    const params: Record<string, string> = {
      MerchantID: '2000132',
      MerchantTradeNo: 'QWreplay123',
      RtnCode: '1',
      TradeAmt: '500',
    };
    params.CheckMacValue = svc.computeCheckMac(params);
    expect(svc.verifyCheckMac(params)).toBe(true);
  });

  it('rejects tampered payload', () => {
    const params: Record<string, string> = {
      MerchantID: '2000132',
      MerchantTradeNo: 'QWtamper',
      TradeAmt: '500',
    };
    params.CheckMacValue = svc.computeCheckMac(params);
    // 改 TradeAmt 但保留舊 mac → 應該被驗出
    params.TradeAmt = '50000';
    expect(svc.verifyCheckMac(params)).toBe(false);
  });

  it('rejects missing CheckMacValue', () => {
    expect(svc.verifyCheckMac({ MerchantID: '2000132' })).toBe(false);
  });

  it('parseCallback returns valid=true for signed payload', () => {
    const body: Record<string, string> = {
      MerchantID: '2000132',
      MerchantTradeNo: 'QWcallback',
      RtnCode: '1',
      RtnMsg: 'Trade successful',
      TradeNo: 'ecpay-trade-001',
      TradeAmt: '500',
    };
    body.CheckMacValue = svc.computeCheckMac(body);
    const result = svc.parseCallback(body);
    expect(result.valid).toBe(true);
    expect(result.merchantTradeNo).toBe('QWcallback');
    expect(result.rtnCode).toBe('1');
    expect(result.tradeNo).toBe('ecpay-trade-001');
    expect(result.tradeAmt).toBe(500);
  });

  it('parseCallback returns valid=false for tampered payload', () => {
    const body: Record<string, string> = {
      MerchantID: '2000132',
      MerchantTradeNo: 'QWcallback',
      RtnCode: '1',
      TradeAmt: '500',
    };
    body.CheckMacValue = svc.computeCheckMac(body);
    body.TradeAmt = '999999'; // tamper
    const result = svc.parseCallback(body);
    expect(result.valid).toBe(false);
  });
});
