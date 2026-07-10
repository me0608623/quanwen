import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

export const metadata: Metadata = {
  title: "整合",
  description: "券問整合：原生整合台灣在地服務，OAuth 多方登入、綠界 ECPay 金流、超商禮券通路。",
};

const connectors = [
  {
    name: "綠界 ECPay 金流託管",
    desc: "儲值、發放、退款與分潤都經綠界處理，預算全額託管、平台不碰金流。",
  },
  {
    name: "Google 登入",
    desc: "一鍵 OAuth 登入免記密碼，降低註冊流失。",
  },
  {
    name: "LINE 登入",
    desc: "串接台灣最普及的 LINE 帳號，填答者快速進場。",
  },
  {
    name: "7-ELEVEN 數位禮券",
    desc: "累積的積分可兌換 7-ELEVEN 禮券，全台門市通用。",
  },
  {
    name: "全家禮物卡",
    desc: "累積的積分可兌換全家禮物卡，全台門市通用。",
  },
  {
    name: "AI 品質引擎",
    desc: "三層審核與洞察分析內建於流程，問卷發布後即時生效。",
  },
];

export default function IntegrationsPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <h1 className="max-w-4xl font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">
          原生整合台灣在地服務
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--q-body-strong)]">
          OAuth 多方登入、綠界 ECPay 金流、超商禮券通路與 AI
          品質引擎整合在同一平台，打造合規、可擴充的帳號與獎勵體系。
        </p>
      </section>

      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
          {connectors.map((item) => (
            <article
              key={item.name}
              className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6"
            >
              <p className="text-lg font-semibold text-[var(--q-ink)]">{item.name}</p>
              <p className="mt-2 text-sm text-[var(--q-muted)]">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-16 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">
            用在地整合，把問卷營運自動化
          </h2>
          <p className="mt-4 text-sm text-[var(--q-on-primary)]/90 sm:text-base">
            從登入、金流到禮券兌換，交給同一套整合架構管理，降低營運風險與人力成本。
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
