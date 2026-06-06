import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

// 初期以「精選主題」導流到既有說明內容；正式文章陸續上線。
const featured = [
  {
    tag: "品質",
    title: "AI 三層品質審核如何擋下灌水樣本",
    excerpt: "從行為訊號、邏輯檢核到 AI 灰區裁決，了解券問怎麼判定一份填答是否可信。",
    href: "/guide",
  },
  {
    tag: "防濫用",
    title: "防刷機制：頻率上限、填太快偵測與機器人封禁",
    excerpt: "獎勵只發給認真填答的人。看看我們用哪些機制守住問卷品質。",
    href: "/guide",
  },
  {
    tag: "新手",
    title: "三種發問卷方式：付費取樣、互惠交換、外部連結",
    excerpt: "沒預算也能拿樣本？已有 Google 表單也能用？一次搞懂該選哪種。",
    href: "/faq",
  },
];

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]">Blog</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">部落格</h1>
        <p className="mt-4 max-w-2xl text-base text-[var(--q-muted)]">
          問卷方法、資料品質與平台使用技巧。正式文章陸續上線，先從這些精選主題開始。
        </p>
      </section>

      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {featured.map((p) => (
            <Link key={p.title} href={p.href} className="block rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6 transition-colors hover:border-[var(--q-primary)]/40">
              <span className="rounded-full bg-[var(--q-surface-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--q-muted)]">{p.tag}</span>
              <h2 className="mt-3 text-base font-semibold text-[var(--q-ink)]">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--q-body)]">{p.excerpt}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-[var(--q-primary)]">閱讀 →</span>
            </Link>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-dashed border-[var(--q-hairline)] bg-[var(--q-surface-soft)] p-6 text-center">
            <p className="text-sm text-[var(--q-muted)]">更多深度文章持續更新中。想看哪些主題？<Link href="/contact" className="text-[var(--q-primary)] underline">告訴我們</Link>。</p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
