import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const stories = [
  {
    quote:
      "再也不用擔心問卷被機器人灌爆，AI 品質審核幫我們擋下約 30% 的可疑樣本。",
    author: "某頂大社會科學研究所",
  },
  {
    quote:
      "綠界自動分潤真的是福音，不用再手動一筆筆發禮券給填答者，行政負擔大幅下降。",
    author: "某知名市調公司",
  },
  {
    quote:
      "互惠模式讓我這種沒經費的碩士生也能收到夠多有效樣本，研究時程終於可控。",
    author: "某研究生",
  },
];

export default function StoriesPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <h1 className="max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          他們靠券問拿到了可信的數據
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          頂尖學術機構與市調公司已透過券問完成資料收集，從回覆率到資料可信度都明顯提升。
        </p>
      </section>

      <section className="pb-12">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {stories.map((story) => (
            <article key={story.author} className="rounded-xl bg-[var(--q-surface-card)] p-6">
              <p className="text-[var(--q-accent-amber)]">★★★★★</p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--q-body-strong)]">「{story.quote}」</p>
              <p className="mt-4 text-xs text-[var(--q-muted)]">— {story.author}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 rounded-xl bg-[var(--q-surface-dark)] p-6 text-[var(--q-on-dark)] sm:grid-cols-3">
            <article>
              <p className="text-xs text-[var(--q-on-dark-soft)]">有效回覆率（示意）</p>
              <p className="mt-2 text-3xl font-semibold">89%</p>
            </article>
            <article>
              <p className="text-xs text-[var(--q-on-dark-soft)]">平均配對時間（示意）</p>
              <p className="mt-2 text-3xl font-semibold">30 秒</p>
            </article>
            <article>
              <p className="text-xs text-[var(--q-on-dark-soft)]">累計發放獎勵（示意）</p>
              <p className="mt-2 text-3xl font-semibold">NT$ 12,800,000+</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-16 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">
            下一個成功案例，可以是你的研究計畫
          </h2>
          <p className="mt-4 text-sm text-[var(--q-on-primary)]/90 sm:text-base">
            讓問卷募集、品質驗證與獎勵發放一次到位，縮短從發案到洞察的時間。
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
