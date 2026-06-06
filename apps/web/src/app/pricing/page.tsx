import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <h1 className="max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          透明價格，沒有隱藏費用
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          按需求選擇互惠交換、標準發案或企業客製。所有費率與金流規則公開，讓你清楚掌握每一筆預算用途。
        </p>
      </section>

      <section className="pb-14">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="rounded-xl bg-[var(--q-surface-card)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--q-muted)]">互惠交換</p>
            <h2 className="mt-3 font-serif text-3xl text-[var(--q-ink)]">免費</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--q-body)]">
              用填答換填答，免設獎勵、免服務費。適合學生研究、論文調查與小型團隊驗證。
            </p>
          </article>

          <article className="rounded-xl bg-[var(--q-surface-dark)] p-6 text-[var(--q-on-dark)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--q-on-dark-soft)]">
              標準發案 · 推薦
            </p>
            <h2 className="mt-3 font-serif text-3xl">預算的 15%</h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
              <li>僅從成功發放的問卷預算收取 15% 服務費。</li>
              <li>含 AI 審核與洞察額度，含綠界金流手續費。</li>
              <li>自動過濾無效樣本不計費，未用完預算無條件退回現金錢包。</li>
            </ul>
          </article>

          <article className="rounded-xl bg-[var(--q-surface-card)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--q-muted)]">企業 / 客製</p>
            <h2 className="mt-3 font-serif text-3xl text-[var(--q-ink)]">聯絡我們</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--q-body)]">
              提供大量樣本採集、客製受眾規則、API 整合與專屬客服支援，適合長期研究或品牌追蹤專案。
            </p>
          </article>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-soft)] px-6 py-4 text-center text-sm text-[var(--q-body-strong)]">
            未用預算 100% 退回，平台全程零持股託管。
          </p>
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-16 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">
            用更少試錯成本，換到更可信的問卷結果
          </h2>
          <p className="mt-4 text-sm text-[var(--q-on-primary)]/90 sm:text-base">
            從免費互惠開始，或直接啟用標準發案，依你的時程安排最合適方案。
          </p>
          <Link
            href="/auth/register"
            className="mt-8 inline-block rounded-md bg-[var(--q-canvas)] px-6 py-3 text-sm font-semibold text-[var(--q-ink)] transition hover:bg-[var(--q-surface-soft)]"
          >
            免費開始
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
