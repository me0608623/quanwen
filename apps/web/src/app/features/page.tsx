import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "產品優勢 — 券問 QuanWen",
  description: "券問產品優勢：三層 AI 品質審核、AI 數據分析、互惠問卷同步解鎖、信譽積分系統、綠界金流託管、端到端個資加密",
};

const featureCards = [
  {
    title: "三層 AI 品質審核",
    description:
      "行為訊號、邏輯檢核到 AI 灰區裁決層層把關，只讓可信樣本進入你的報告。",
  },
  {
    title: "AI 數據分析與洞察報告",
    description:
      "自動彙整關鍵指標、情緒分布與趨勢變化，把原始填答直接變成可行動的結論。",
  },
  {
    title: "互惠問卷同步解鎖",
    description:
      "兩人互填、雙邊審核通過才同時解鎖，沒有預算也能穩定累積有效回覆。",
  },
  {
    title: "信譽積分系統",
    description:
      "依答題一致性與歷史品質累積長期信任分數，讓認真填答的人優先接到好任務。",
  },
  {
    title: "綠界金流託管與自動分潤",
    description:
      "預算鎖定、獎勵發放到退款全程自動化；無效樣本不計費，未動用預算原額退回。",
  },
  {
    title: "端到端個資加密",
    description:
      "敏感欄位以 AES-256-GCM 加密保存，從源頭降低個資外洩風險。",
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]">
          Product
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          AI 不是外掛功能，而是貫穿全流程的底層引擎
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          從個人化推薦、AI 問卷草稿、情緒分類到反作弊偵測，券問把 AI
          接點鋪進填答者、問卷方與管理端，讓資料品質與營運效率一起提升。
        </p>
      </section>

      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
          {featureCards.map((card) => (
            <article key={card.title} className="rounded-xl bg-[var(--q-surface-card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--q-ink)]">{card.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-16 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">
            想把問卷流程升級成可持續成長的系統？
          </h2>
          <p className="mt-4 text-sm text-[var(--q-on-primary)]/90 sm:text-base">
            從第一份問卷到大規模研究專案，券問都能提供可追蹤、可驗證的品質保障。
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
