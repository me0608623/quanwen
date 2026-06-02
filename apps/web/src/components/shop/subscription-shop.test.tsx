import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionShop } from './subscription-shop';

const mockUseSubscription = vi.fn();
const mockUseSubscribePlan = vi.fn();
const mockUseRedeemSubscription = vi.fn();
const shopCatalogSpy = vi.fn((_: unknown) => null);

vi.mock('@/hooks/use-pricing', () => ({
  useSubscription: () => mockUseSubscription(),
  useSubscribePlan: () => mockUseSubscribePlan(),
  useRedeemSubscription: () => mockUseRedeemSubscription(),
}));

vi.mock('@/components/shop/shop-catalog', () => ({
  ShopCatalog: (props: unknown) => {
    shopCatalogSpy(props);
    return <div>shop catalog</div>;
  },
}));

const subscriptionSnapshot = {
  currentPlan: 'vip' as const,
  plans: [
    { id: 'free' as const, name: 'Free', priceMonthly: 0, dailyAiLimit: 3, badge: '目前方案', cta: '已啟用' },
    { id: 'vip' as const, name: 'VIP', priceMonthly: 890, dailyAiLimit: 50, badge: '熱門', cta: '升級 VIP' },
    { id: 'vvip' as const, name: 'VVIP', priceMonthly: 1990, dailyAiLimit: null, badge: '專業', cta: '升級 VVIP' },
  ],
  usage: {
    todayUsed: 12,
    todayLimit: 50,
    display: '12/50',
  },
  wallet: {
    pointsBalance: 620,
  },
  redemption: {
    targetPlan: 'vip' as const,
    costPoints: 500,
    durationDays: 7,
    affordable: true,
  },
};

describe('SubscriptionShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSubscription.mockReturnValue({
      data: subscriptionSnapshot,
      isLoading: false,
      error: null,
    });
    mockUseSubscribePlan.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseRedeemSubscription.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it('顯示目前方案、今日用量與 VIP 積分兌換資訊', () => {
    const html = renderToStaticMarkup(<SubscriptionShop />);

    expect(html).toContain('VIP 訂閱與積分兌換');
    expect(html).toContain('目前方案');
    expect(html).toContain('今日 AI 使用量');
    expect(html).toContain('12/50');
    expect(html).toContain('500 點 / 7 天');
    expect(html).toContain('你目前是');
  });

  it('把積分商城直接整合進同頁商店區塊', () => {
    renderToStaticMarkup(<SubscriptionShop />);

    expect(shopCatalogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        compact: true,
        showHeader: false,
        showMyRedemptionsLink: false,
      }),
    );
  });

  it('積分不足時改顯示提醒文案', () => {
    mockUseSubscription.mockReturnValue({
      data: {
        ...subscriptionSnapshot,
        wallet: { pointsBalance: 120 },
        redemption: {
          ...subscriptionSnapshot.redemption,
          affordable: false,
        },
      },
      isLoading: false,
      error: null,
    });

    const html = renderToStaticMarkup(<SubscriptionShop />);

    expect(html).toContain('積分還不夠，先去賺點數。');
    expect(html).toContain('還差一點火力。');
  });

  it('載入失敗時顯示錯誤訊息', () => {
    mockUseSubscription.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    });

    const html = renderToStaticMarkup(<SubscriptionShop />);

    expect(html).toContain('商店載入失敗，請重新整理。');
  });
});
