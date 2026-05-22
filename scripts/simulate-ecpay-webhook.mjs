#!/usr/bin/env node
/**
 * Phase S: ECPay webhook simulator
 *
 * 模擬綠界 server 在用戶付款完成後 POST 到我們的 /wallet/ecpay/callback。
 * 用本地 dev 的 ECPAY_HASH_KEY / HASH_IV 簽出正確 CheckMacValue。
 *
 * Usage:
 *   node scripts/simulate-ecpay-webhook.mjs <tradeNo> [--fail] [--replay]
 *
 *   <tradeNo>   你呼叫 POST /wallet/ecpay/order 後，server log 印出的 MerchantTradeNo
 *               （或從 transactions 表的 external_ref 撈）
 *   --fail      模擬 RtnCode != 1（付款失敗 callback）
 *   --replay    模擬重複呼叫（測試 idempotency）— 直接 POST 同一筆兩次
 *
 * Env:
 *   API_URL              default http://localhost:3001
 *   ECPAY_HASH_KEY       同 .env 設的
 *   ECPAY_HASH_IV        同上
 */

import { createHash } from 'node:crypto';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const HASH_KEY = process.env.ECPAY_HASH_KEY ?? 'pwFHCqoQZGmho4w6';        // ECPay sandbox 預設值
const HASH_IV  = process.env.ECPAY_HASH_IV  ?? 'EkRm7iFT261dpevs';        // ECPay sandbox 預設值
const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID ?? '2000132';            // ECPay sandbox 預設

const args = process.argv.slice(2);
const tradeNo = args[0];
const fail = args.includes('--fail');
const replay = args.includes('--replay');

if (!tradeNo) {
  console.error(`Usage: node simulate-ecpay-webhook.mjs <tradeNo> [--fail] [--replay]\n`);
  console.error(`先呼叫 POST /api/v1/wallet/ecpay/order 拿到 MerchantTradeNo，再丟給這個 script。`);
  process.exit(1);
}

/**
 * 跟 ecpay.service.ts 同一套 CheckMacValue 算法（HashKey + sorted params + HashIV → SHA256 → uppercase）
 */
function computeCheckMac(params) {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const raw = `HashKey=${HASH_KEY}&${sorted.map(([k, v]) => `${k}=${v}`).join('&')}&HashIV=${HASH_IV}`;
  const encoded = encodeURIComponent(raw)
    .replace(/%20/g, '+')
    .replace(/%21/g, '!')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2A/g, '*')
    .replace(/%2D/g, '-')
    .replace(/%2E/g, '.')
    .replace(/%5F/g, '_')
    .toLowerCase();
  return createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

async function postCallback(label) {
  const params = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    PaymentDate: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }).replace(/\//g, '/'),
    PaymentType: 'Credit_CreditCard',
    PaymentTypeChargeFee: '0',
    RtnCode: fail ? '10100073' : '1',
    RtnMsg: fail ? '購買人付款已失敗' : '交易成功',
    SimulatePaid: '0',
    StoreID: '',
    TradeAmt: '500',
    TradeDate: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }).replace(/\//g, '/'),
    TradeNo: `ecpay_demo_${tradeNo.slice(-8)}_${Date.now()}`,
  };
  params.CheckMacValue = computeCheckMac(params);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}/api/v1/wallet/ecpay/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  console.log(`[${label}] HTTP ${res.status} → '${text}'`);
  return { status: res.status, body: text };
}

console.log(`Simulating ECPay callback to ${API_URL}/api/v1/wallet/ecpay/callback`);
console.log(`  tradeNo=${tradeNo}  result=${fail ? 'FAIL' : 'SUCCESS'}  replay=${replay}\n`);

const first = await postCallback('first');

if (replay && first.status === 200 && first.body.includes('OK')) {
  console.log(`\nReplaying same callback (testing idempotency)...`);
  const second = await postCallback('replay');
  if (second.status === 200 && second.body.includes('OK')) {
    console.log(`\n✅ Idempotency OK — replay accepted but no double-credit (check wallet balance)`);
  } else {
    console.log(`\n✗ Replay returned unexpected: ${second.status} '${second.body}'`);
  }
}
