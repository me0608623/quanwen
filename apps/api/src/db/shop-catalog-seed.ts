import type { NewPointShopItem } from './schema';

/**
 * 積分商城禮券雛形目錄（便利商店禮券）。
 *
 * 換算基準：1 積分 = NT$0.5 → costPoints = faceValue × 2（無加成，雛形階段）。
 * 圖片：7-11 100/200/500 已放 apps/web/public/shop/；其餘（7-11 50/300、全家全系列）
 * 暫無官方圖片 → imageUrl=null，前端顯示商店配色 placeholder，日後補圖只需更新此檔 + 上傳圖片。
 * 面額來源：7-ELEVEN 數位商品禮券 50/100/200/300/500；全家禮物卡 50/100/200/500。
 */
export const VOUCHER_CATALOG: NewPointShopItem[] = [
  // ── 7-ELEVEN ──
  { name: '7-ELEVEN 50 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 50, costPoints: 100, imageUrl: null, stockQty: -1, sortOrder: 10 },
  { name: '7-ELEVEN 100 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 100, costPoints: 200, imageUrl: '/shop/voucher-711-100.jpg', stockQty: -1, sortOrder: 11 },
  { name: '7-ELEVEN 200 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 200, costPoints: 400, imageUrl: '/shop/voucher-711-200.jpg', stockQty: -1, sortOrder: 12 },
  { name: '7-ELEVEN 300 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 300, costPoints: 600, imageUrl: null, stockQty: -1, sortOrder: 13 },
  { name: '7-ELEVEN 500 元數位商品禮券', description: '全台 7-ELEVEN 門市通用，無使用期限。', category: 'voucher_711', faceValue: 500, costPoints: 1000, imageUrl: '/shop/voucher-711-500.jpg', stockQty: -1, sortOrder: 14 },
  // ── 全家 FamilyMart ──
  { name: '全家 50 元虛擬禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 50, costPoints: 100, imageUrl: null, stockQty: -1, sortOrder: 20 },
  { name: '全家 100 元虛擬禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 100, costPoints: 200, imageUrl: null, stockQty: -1, sortOrder: 21 },
  { name: '全家 200 元虛擬禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 200, costPoints: 400, imageUrl: null, stockQty: -1, sortOrder: 22 },
  { name: '全家 500 元虛擬禮物卡', description: '全台全家便利商店門市通用，無使用期限。', category: 'voucher_familymart', faceValue: 500, costPoints: 1000, imageUrl: null, stockQty: -1, sortOrder: 23 },
];
