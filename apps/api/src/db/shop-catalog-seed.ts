import type { NewPointShopItem } from './schema';

/**
 * 積分商城禮券雛形目錄（便利商店禮券）。
 *
 * 換算基準：1 積分 = NT$0.5；平台加成 15%（PLATFORM_MARKUP_RATE，與現金獎勵抽成 PLATFORM_FEE_RATE 一致）。
 * → costPoints = round(faceValue × 2 × 1.15)。例：NT$100 → 230 點、NT$500 → 1150 點。
 * 圖片：全部放 apps/web/public/vouchers/（不可放 /shop/，會被 middleware 當受保護路由攔截）。
 *   7-11 圖來源 ibon i禮讚；全家圖來源 Edenred Richart Life（官方禮物卡卡面）。
 * 面額：7-ELEVEN 50/100/200/300/500；全家禮物卡 50/100/200/500。
 */
export const PLATFORM_MARKUP_RATE = 0.15;

const points = (faceValue: number) => Math.round(faceValue * 2 * (1 + PLATFORM_MARKUP_RATE));

export const VOUCHER_CATALOG: NewPointShopItem[] = [
  // ── 7-ELEVEN ──
  { name: '7-ELEVEN 50 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 50, costPoints: points(50), imageUrl: '/vouchers/voucher-711-50.jpg', stockQty: -1, sortOrder: 10 },
  { name: '7-ELEVEN 100 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 100, costPoints: points(100), imageUrl: '/vouchers/voucher-711-100.jpg', stockQty: -1, sortOrder: 11 },
  { name: '7-ELEVEN 200 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 200, costPoints: points(200), imageUrl: '/vouchers/voucher-711-200.jpg', stockQty: -1, sortOrder: 12 },
  { name: '7-ELEVEN 300 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 300, costPoints: points(300), imageUrl: '/vouchers/voucher-711-300.jpg', stockQty: -1, sortOrder: 13 },
  { name: '7-ELEVEN 500 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 500, costPoints: points(500), imageUrl: '/vouchers/voucher-711-500.jpg', stockQty: -1, sortOrder: 14 },
  // ── 全家 FamilyMart ──
  { name: '全家 50 元禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 50, costPoints: points(50), imageUrl: '/vouchers/voucher-familymart-50.jpg', stockQty: -1, sortOrder: 20 },
  { name: '全家 100 元禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 100, costPoints: points(100), imageUrl: '/vouchers/voucher-familymart-100.jpg', stockQty: -1, sortOrder: 21 },
  { name: '全家 200 元禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 200, costPoints: points(200), imageUrl: '/vouchers/voucher-familymart-200.jpg', stockQty: -1, sortOrder: 22 },
  { name: '全家 500 元禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 500, costPoints: points(500), imageUrl: '/vouchers/voucher-familymart-500.jpg', stockQty: -1, sortOrder: 23 },
];
