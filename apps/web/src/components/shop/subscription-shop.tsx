'use client';

import { useMemo } from 'react';
import { ShopCatalog } from '@/components/shop/shop-catalog';
import {
  useRedeemSubscription,
  useSubscribePlan,
  useSubscription,
  type SubscriptionPlan,
} from '@/hooks/use-pricing';
import { cn } from '@/lib/utils';

const PLAN_ACCENT: Record<SubscriptionPlan, string> = {
  free: 'border-slate-200 bg-white',
  vip: 'border-amber-300 bg-gradient-to-b from-amber-50 to-white',
  vvip: 'border-violet-300 bg-gradient-to-b from-violet-50 to-white',
};

const PLAN_DESCRIPTION: Record<SubscriptionPlan, string> = {
  free: '每日 3 次 AI，先用再說。',
  vip: '每日 50 次 AI，適合穩定產問卷的團隊。',
  vvip: '無限 AI，給那種把模型當工讀生操的狠角色。',
};

interface SubscriptionShopProps {
  className?: string;
}

export function SubscriptionShop({ className }: SubscriptionShopProps) {
  const { data, isLoading, error } = useSubscription();
  const subscribe = useSubscribePlan();
  const redeem = useRedeemSubscription();

  const currentPlan = data?.currentPlan ?? 'free';
  const usageText = useMemo(() => data?.usage.display ?? '0/3', [data?.usage.display]);
  const currentPlanDetail = useMemo(
    () => data?.plans.find((plan) => plan.id === currentPlan),
    [currentPlan, data?.plans],
  );

  const handleSubscribe = async (plan: Exclude<SubscriptionPlan, 'free'>) => {
    try {
      await subscribe.mutateAsync(plan);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(message ?? '建立付款單失敗');
    }
  };

  const handleRedeem = async () => {
    try {
      const result = await redeem.mutateAsync();
      alert(result.message);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(message ?? '兌換失敗');
    }
  };

  if (isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">商店載入中…</div>;
  }

  if (error || !data) {
    return <div className="py-10 text-sm text-destructive">商店載入失敗，請重新整理。</div>;
  }

  return (
    <div className={cn('space-y-6', className)}>
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Dashboard 商店</p>
            <h1 className="mt-2 text-3xl font-bold">VIP 訂閱與積分兌換</h1>
            <p className="mt-2 text-sm text-slate-300">
              你目前是 <span className="font-semibold text-white">{currentPlan.toUpperCase()}</span>，今日 AI 使用量 {usageText}。
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <p className="text-slate-300">目前積分</p>
            <p className="mt-1 text-2xl font-bold">{data.wallet.pointsBalance.toLocaleString()} 點</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">目前方案</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{currentPlanDetail?.name ?? currentPlan.toUpperCase()}</h2>
          <p className="mt-2 text-sm text-slate-600">{currentPlanDetail?.badge ?? '目前使用中'}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">今日 AI 使用量</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{usageText}</h2>
          <p className="mt-2 text-sm text-slate-600">包含問卷優化、題目生成與結果分析。</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">VIP 積分兌換</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            {data.redemption.costPoints} 點 / {data.redemption.durationDays} 天
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {data.redemption.affordable ? '你現在就能直接換。' : '積分還不夠，先去賺點數。'}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {data.plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPaid = plan.id !== 'free';

          return (
            <article
              key={plan.id}
              className={`rounded-2xl border p-5 shadow-sm ${PLAN_ACCENT[plan.id]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{plan.badge}</p>
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    目前使用
                  </span>
                )}
              </div>

              <div className="mt-4">
                <p className="text-3xl font-bold text-slate-900">
                  {plan.priceMonthly === 0 ? '免費' : `NT$${plan.priceMonthly}`}
                  {plan.priceMonthly > 0 && <span className="ml-1 text-sm font-normal text-slate-500">/月</span>}
                </p>
                <p className="mt-2 text-sm text-slate-600">{PLAN_DESCRIPTION[plan.id]}</p>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• 每日 AI 額度：{plan.dailyAiLimit === null ? '無限' : `${plan.dailyAiLimit} 次`}</li>
                <li>• 問卷優化、題目生成、結果分析都算在內</li>
                <li>• 付款後走綠界，不玩花招</li>
              </ul>

              <button
                onClick={() => {
                  if (plan.id === 'free' || isCurrent) return;
                  void handleSubscribe(plan.id);
                }}
                disabled={!isPaid || isCurrent || subscribe.isPending}
                className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCurrent ? '目前方案' : subscribe.isPending ? '建立付款中…' : plan.cta}
              </button>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">積分兌換 VIP</p>
          <h2 className="mt-2 text-xl font-bold text-amber-950">
            {data.redemption.costPoints} 積分 = {data.redemption.durationDays} 天 VIP
          </h2>
          <p className="mt-2 text-sm text-amber-900/80">
            適合短期爆量需求。你現在有 {data.wallet.pointsBalance.toLocaleString()} 點，
            {data.redemption.affordable ? '可以直接換。' : '還差一點火力。'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void handleRedeem()}
              disabled={!data.redemption.affordable || redeem.isPending}
              className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {redeem.isPending ? '兌換中…' : '用積分兌換 VIP'}
            </button>
            <span className="text-xs text-amber-800">
              兌換後立即升級，不用再跟付款頁摔角。
            </span>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">禮券 / 商品兌換</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">同頁整合積分商城</h2>
          <p className="mt-2 text-sm text-slate-600">
            既然都叫商店了，就別再把人踢去另一頁。禮券兌換直接放這裡，少走冤枉路。
          </p>
          <div className="mt-5">
            <ShopCatalog compact showHeader={false} showMyRedemptionsLink={false} />
          </div>
        </article>
      </section>
    </div>
  );
}
