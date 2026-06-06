import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const capabilities = [
  {
    title: "外部問卷連結整合",
    description:
      "已有 Google 表單、SurveyMonkey 等外部問卷？直接貼上連結即可在券問發布、媒合受試者並導流，無需重建題目。",
    ready: true,
  },
  {
    title: "問卷匯入 API",
    description:
      "支援 Excel／CSV／JSON／Google Forms／PDF 等格式匯入，快速把既有問卷轉成站內可審核的問卷。",
    ready: true,
  },
  {
    title: "Webhook 事件通知",
    description:
      "問卷收到新填答、達標、開獎等事件主動推送到你的系統（規劃中，歡迎洽詢需求）。",
    ready: false,
  },
  {
    title: "資料匯出 API",
    description:
      "以 PDF／Excel／CSV／Markdown 匯出結果，文字答案經 PII 去識別化處理（規劃中）。",
    ready: false,
  },
];

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]">Developers</p>
        <h1 className="mt-4 max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          把券問接進你的研究與產品流程
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          券問以 NestJS API + Next.js 打造，提供問卷匯入、外部連結整合與資料匯出能力。
          想做更深度的串接（Webhook、批次匯出、企業整合），歡迎與我們聯絡取得 API 存取。
        </p>
      </section>

      <section className="pb-16">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          {capabilities.map((c) => (
            <article key={c.title} className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--q-ink)]">{c.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.ready ? "已上線" : "規劃中"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">{c.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--q-surface-dark)] py-16 text-[var(--q-on-dark)]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em]">需要 API 存取或客製整合？</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
            API 目前以合作夥伴方式開放。請透過聯絡表單說明你的使用情境（資料量、串接方式、用途），我們會評估並提供存取與文件。
          </p>
          <Link href="/contact" className="mt-6 inline-block rounded-md bg-[var(--q-canvas)] px-6 py-3 text-sm font-semibold text-[var(--q-ink)] transition hover:bg-[var(--q-surface-soft)]">
            聯絡取得 API 存取
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
