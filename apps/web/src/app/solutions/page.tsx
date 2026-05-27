import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

export default function SolutionsPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <h1 className="max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          為問卷方與填答者打造的雙邊閉環
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          券問把「媒合、品質、金流、獎勵」整成同一套系統，讓問卷方拿到可信資料，也讓填答者每一次投入都看得到收益。
        </p>
      </section>

      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="rounded-xl bg-[var(--q-surface-dark)] p-7 text-[var(--q-on-dark)]">
            <h2 className="font-serif text-3xl tracking-[-0.01em]">給問卷發布方</h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
              <li>受眾條件篩選後再媒合，提升樣本命中率與回收效率。</li>
              <li>三層 AI 品質過濾，先排除無效樣本再進入報告。</li>
              <li>獎勵發放、分潤與退款自動化，免去人工對帳與手動發送。</li>
            </ul>
          </article>

          <article className="rounded-xl bg-[var(--q-surface-card)] p-7">
            <h2 className="font-serif text-3xl tracking-[-0.01em] text-[var(--q-ink)]">給問卷填答者</h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--q-body)]">
              <li>填問卷不再做白工，驗證通過即進入我的收益與待領獎勵。</li>
              <li>信譽積分越高，越容易取得高品質與高報酬任務。</li>
              <li>可自由選擇現金、超商禮券與積分，獎勵型態更彈性。</li>
            </ul>
          </article>

          <article className="rounded-xl bg-[var(--q-surface-card)] p-7">
            <h2 className="font-serif text-3xl tracking-[-0.01em] text-[var(--q-ink)]">給互惠用戶</h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--q-body)]">
              <li>沒有研究預算也能啟動專案，以填答換填答持續擴充樣本。</li>
              <li>30 秒快速配對，找不到同類族群時自動切換 FIFO 流程。</li>
              <li>雙方審核通過才同步解鎖，確保交換到的回覆同樣可信。</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-16 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">
            讓問卷流程回到公平交換，而不是盲目燒預算
          </h2>
          <p className="mt-4 text-sm text-[var(--q-on-primary)]/90 sm:text-base">
            立即建立帳號，選擇付費發案或互惠交換，按你的節奏啟動研究。
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
