import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const values = [
  {
    title: "品質優先",
    description:
      "問卷的價值來自真實樣本。我們用 AI 三層審核、防刷機制與信譽系統，確保每一份回覆都值得信任。",
  },
  {
    title: "雙邊自助",
    description:
      "一個帳號就能發問卷與填問卷。問卷方精準取樣、填答方公平賺取回報，供需在同一平台高效媒合。",
  },
  {
    title: "透明合規",
    description:
      "綠界金流全程託管、平台帳上零持股；敏感個資以 AES-256 加密保存，流程可追蹤、可稽核。",
  },
  {
    title: "在地友善",
    description:
      "支援現金、7-11／全家禮券與積分回饋，貼近台灣使用者習慣，讓填答回報真正用得到。",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]">About</p>
        <h1 className="mt-4 max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          讓每一份問卷，都拿到值得信任的答案
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          券問 QuanWen 是台灣的「AI 把關 + 雙邊自助」問卷媒合平台。我們相信：好的研究始於好的資料。
          透過 AI 品質審核、在地獎勵與防濫用機制，我們把「灌水樣本」擋在門外，讓問卷方花的每一分預算都換到真實洞察，
          也讓認真填答的人得到公平回報。
        </p>
      </section>

      <section className="pb-16">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          {values.map((v) => (
            <article key={v.title} className="rounded-xl bg-[var(--q-surface-card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--q-ink)]">{v.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">{v.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--q-surface-dark)] py-16 text-[var(--q-on-dark)]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em]">我們在解決什麼問題</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
            傳統線上問卷最大的痛點是「資料品質」——機器人、亂填、刷獎勵讓樣本失真；而填答者又常常付出時間卻拿不到合理回報。
            券問用技術同時解決供需兩端：對問卷方，提供精準受眾媒合與多層品質防護；對填答方，提供透明審核與在地獎勵。
            沒有預算的人，也能用「互惠互填」交換真實樣本。
          </p>
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-16 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">加入券問,一起把問卷做對</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/auth/register" className="rounded-md bg-[var(--q-canvas)] px-6 py-3 text-sm font-semibold text-[var(--q-ink)] transition hover:bg-[var(--q-surface-soft)]">
              免費開始
            </Link>
            <Link href="/contact" className="rounded-md border border-[var(--q-on-primary)]/40 px-6 py-3 text-sm font-semibold text-[var(--q-on-primary)] transition hover:bg-[var(--q-on-primary)]/10">
              聯絡我們
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
