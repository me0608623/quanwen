'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ClipboardCheck,
  FileSearch,
  Lightbulb,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ShopCatalog } from '@/components/shop/shop-catalog';
import { GoldWave } from '@/components/marketing/animation/gold-wave';
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
  free: '每日 3 次 AI，適合先體驗智慧問卷工作流。',
  vip: '每日 50 次 AI，適合穩定產出與持續分析的團隊。',
  vvip: '無限 AI，適合大量研究、多專案與高頻分析需求。',
};

const AI_FEATURES = [
  {
    icon: WandSparkles,
    title: 'AI 題目生成',
    tag: '從零建立',
    description: '輸入主題、目的與受眾，快速產生可編輯的問卷題組，縮短規劃時間。',
    tone: 'from-blue-500/15 to-cyan-400/5 text-blue-700',
  },
  {
    icon: Lightbulb,
    title: '問卷優化建議',
    tag: '提升品質',
    description: '檢查題目語意、結構與缺漏，找出弱點並提供具體修正方向。',
    tone: 'from-amber-500/15 to-orange-400/5 text-amber-700',
  },
  {
    icon: BarChart3,
    title: 'AI 結果洞察',
    tag: '讀懂回覆',
    description: '將填答整理成摘要、重點發現、疑慮與行動建議，快速掌握結論。',
    tone: 'from-violet-500/15 to-fuchsia-400/5 text-violet-700',
  },
  {
    icon: ShieldCheck,
    title: '反作弊題建議',
    tag: '守住品質',
    description: '依問卷內容產生注意力檢核題，降低亂填與低品質樣本干擾。',
    tone: 'from-emerald-500/15 to-teal-400/5 text-emerald-700',
  },
  {
    icon: ClipboardCheck,
    title: '上架前 AI 預審',
    tag: '提早修正',
    description: '在發布前檢查風險、完成率與可改善項目，減少上架後反覆修改。',
    tone: 'from-rose-500/15 to-pink-400/5 text-rose-700',
  },
  {
    icon: ScanSearch,
    title: '文字回覆分析',
    tag: '挖掘脈絡',
    description: '辨識文字題的情緒與常見主題，從開放式回覆中找到可行動線索。',
    tone: 'from-sky-500/15 to-indigo-400/5 text-sky-700',
  },
] as const;

const AI_WORKFLOW = [
  { step: '01', title: '先生成', description: '用 AI 快速建立第一版題目', icon: Sparkles },
  { step: '02', title: '再優化', description: '檢查盲點並補上品質機制', icon: FileSearch },
  { step: '03', title: '後分析', description: '把回覆整理為可採取的洞察', icon: BarChart3 },
] as const;

interface SubscriptionShopProps {
  className?: string;
}

export function SubscriptionShop({ className }: SubscriptionShopProps) {
  const rootRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !data || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      intro
        .from('[data-shop-hero-copy]', { opacity: 0, y: 22, duration: 0.7 })
        .from('[data-shop-hero-card]', { opacity: 0, x: 24, duration: 0.6 }, '-=0.42')
        .from('[data-shop-stat]', { opacity: 0, y: 18, duration: 0.45, stagger: 0.1 }, '-=0.28');

      gsap.to('[data-shop-orb]', {
        x: 22,
        y: -16,
        scale: 1.08,
        duration: 4.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      gsap.utils.toArray<HTMLElement>('[data-shop-reveal]').forEach((section) => {
        gsap.from(section, {
          y: 34,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 86%',
            once: true,
          },
        });
      });

      gsap.from('[data-ai-feature]', {
        y: 24,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '[data-ai-feature-grid]',
          start: 'top 82%',
          once: true,
        },
      });
    }, root);

    return () => ctx.revert();
  }, [data]);

  if (isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">商店載入中…</div>;
  }

  if (error || !data) {
    return <div className="py-10 text-sm text-destructive">商店載入失敗，請重新整理。</div>;
  }

  return (
    <div ref={rootRef} className={cn('space-y-8', className)}>
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-8 py-10 text-white shadow-xl shadow-slate-950/10 md:px-8 md:py-10">
        <GoldWave className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-80" />
        <div data-shop-orb aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_280px] lg:items-end">
          <div data-shop-hero-copy>
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-violet-100">
              <Bot className="h-3.5 w-3.5" />
              AI POWERED SURVEY
            </p>
            <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
              從問卷發想，到結果洞察
              <span className="block bg-gradient-to-r from-violet-300 via-sky-200 to-amber-200 bg-clip-text text-transparent">
                讓 AI 加速每一步。
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              訂閱方案提供每日 AI 額度，可用於題目生成、問卷優化與結果分析。
              把時間留給真正重要的決策，而不是反覆整理資料。
            </p>
          </div>

          <div data-shop-hero-card className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">目前 AI 狀態</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold">{currentPlan.toUpperCase()}</p>
                <p className="mt-1 text-xs text-slate-300">今日使用量 {usageText}</p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                使用中
              </span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-300"
                style={{
                  width: data.usage.todayLimit === null
                    ? '100%'
                    : `${Math.min(100, (data.usage.todayUsed / data.usage.todayLimit) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article data-shop-stat className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">目前方案</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{currentPlanDetail?.name ?? currentPlan.toUpperCase()}</h2>
          <p className="mt-2 text-sm text-slate-600">{currentPlanDetail?.badge ?? '目前使用中'}</p>
        </article>

        <article data-shop-stat className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">今日 AI 使用量</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{usageText}</h2>
          <p className="mt-2 text-sm text-slate-600">包含問卷優化、題目生成與結果分析。</p>
        </article>

        <article data-shop-stat className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">VIP 積分兌換</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            {data.redemption.costPoints} 點 / {data.redemption.durationDays} 天
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {data.redemption.affordable ? '你現在就能直接換。' : '積分還不夠，先去賺點數。'}
          </p>
        </article>
      </section>

      <section data-shop-reveal className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">訂閱後可以做什麼？</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            一套 AI 工具，完成問卷的完整生命週期
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            不只是一個聊天框。全問卷把 AI 放進實際工作流程，讓你在需要時直接取得下一步建議。
          </p>
        </div>

        <div data-ai-feature-grid className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {AI_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                data-ai-feature
                className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white hover:shadow-lg hover:shadow-slate-200/60"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${feature.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <h3 className="font-bold text-slate-900">{feature.title}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                    {feature.tag}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section data-shop-reveal className="rounded-3xl border border-slate-200 bg-slate-50 p-6 md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">AI 工作流</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">把每次 AI 使用，花在最有價值的地方</h2>
          </div>
          <p className="text-sm text-slate-500">題目生成、問卷優化、結果分析皆計入每日 AI 額度。</p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {AI_WORKFLOW.map((item, index) => {
            const Icon = item.icon;
            return (
              <article key={item.step} className="relative rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-[0.18em] text-slate-500">STEP {item.step}</span>
                  <Icon className="h-5 w-5 text-blue-700" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                {index < AI_WORKFLOW.length - 1 && (
                  <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-300 md:block" />
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section data-shop-reveal>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">選擇方案</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">依照你的使用頻率升級 AI 額度</h2>
          <p className="mt-2 text-sm text-slate-600">所有方案都能使用核心 AI 工具，差別在每日可使用次數。</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
        {data.plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPaid = plan.id !== 'free';

          return (
            <article
              key={plan.id}
              className={`relative rounded-2xl border p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg ${PLAN_ACCENT[plan.id]}`}
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
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />每日 AI 額度：{plan.dailyAiLimit === null ? '無限' : `${plan.dailyAiLimit} 次`}</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />AI 題目生成與問卷優化</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />AI 結果洞察與分析建議</li>
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
        </div>
      </section>

      <section data-shop-reveal className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">積分兌換 VIP</p>
          <h2 className="mt-2 text-xl font-bold text-amber-950">
            {data.redemption.costPoints} 積分 = {data.redemption.durationDays} 天 VIP
          </h2>
          <p className="mt-2 text-sm text-amber-900/80">
            適合短期爆量需求。你現在有 {data.wallet.pointsBalance.toLocaleString()} 點，
            {data.redemption.affordable ? '可以直接換。' : '累積足夠積分後即可兌換。'}
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
              兌換後立即升級，不需要進入付款流程。
            </span>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">禮券 / 商品兌換</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">同頁整合積分商城</h2>
          <p className="mt-2 text-sm text-slate-600">
            除了訂閱 AI 額度，也可以直接使用累積積分兌換禮券與商品。
          </p>
          <div className="mt-5">
            <ShopCatalog compact showHeader={false} showMyRedemptionsLink={false} />
          </div>
        </article>
      </section>
    </div>
  );
}
