import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { LoadingScreen } from "@/components/marketing/animation/loading-screen";
import { ScrollReveal } from "@/components/marketing/animation/scroll-reveal";
import { HeroBackdrop } from "@/components/marketing/animation/hero-backdrop";
import { HeroIntro } from "@/components/marketing/animation/hero-intro";

const aiLayers = [
  {
    title: "Layer 1 行為訊號偵測",
    description:
      "即時比對填答耗時、作答頻率與點擊模式，第一時間攔下機器人與亂填樣本。",
  },
  {
    title: "Layer 2 邏輯與注意力檢核",
    description:
      "自動插入反向題與注意力檢核題，快速淘汰答非所問或注意力渙散的回覆。",
  },
  {
    title: "Layer 3 AI 灰區裁決",
    description:
      "分數落在灰區時才啟動深度語義分析，讓可疑樣本有更精準的最終判定。",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <LoadingScreen />
      <HeroIntro />
      <ScrollReveal />
      <MarketingNav />

      <section
        data-hero-root
        className="relative isolate mx-auto max-w-6xl overflow-hidden px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-24"
      >
        <HeroBackdrop />
        <div className="relative z-10 grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p
              data-hero-badge
              className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]"
            >
              AI 把關的雙邊問卷平台
            </p>
            <h1
              data-hero-title
              className="mt-4 font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl lg:text-6xl"
            >
              發問卷找對的人，
              <br />
              填問卷賺回報。
            </h1>
            <p data-hero-copy className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--q-body-strong)]">
              付費發案、精準媒合受眾；填問卷的人賺現金、7-11／全家禮券或積分。
              沒預算？也能用互惠交換互填拿樣本。AI 全程把關品質、還能幫你生成問卷草稿。
            </p>
            <p data-hero-copy className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--q-muted)]">
              券問是台灣首個「AI 把關 + 雙邊自助」的問卷媒合平台 —— 付費取樣、互惠交換、賺積分換現金，一個帳號全包。
            </p>
            <div data-hero-cta className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/auth/register"
                className="q-btn-anim rounded-md bg-[var(--q-primary)] px-5 py-3 text-sm font-semibold text-[var(--q-on-primary)] transition hover:bg-[var(--q-primary-active)]"
              >
                免費開始
              </Link>
              <a
                href="#modes"
                className="q-btn-anim rounded-md border border-[var(--q-hairline)] px-5 py-3 text-sm font-semibold text-[var(--q-ink)] transition hover:bg-[var(--q-surface-card)]"
              >
                看四種使用方式
              </a>
            </div>
          </div>

          <div
            data-hero-panel
            className="rounded-xl bg-[var(--q-surface-dark)] p-6 text-[var(--q-on-dark)] sm:p-8"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--q-on-dark-soft)]">
              一個帳號 · 四種使用方式
            </p>
            <div className="mt-6 space-y-3">
              {[
                { icon: "💰", title: "付費發問卷", desc: "設獎勵+受眾，AI 媒合精準填答者" },
                { icon: "🎁", title: "填問卷賺回報", desc: "現金 / 7-11 禮券 / 積分 + 每日轉盤" },
                { icon: "🤝", title: "互惠交換", desc: "沒預算？互填問卷拿樣本" },
                { icon: "✨", title: "AI 協助製作", desc: "AI 生成問卷草稿 + 反機器人題" },
              ].map((m) => (
                <div
                  key={m.title}
                  data-hero-panel-item
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-[var(--q-surface-dark-soft)] px-4 py-3"
                >
                  <span className="text-xl">{m.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--q-on-dark)]">{m.title}</p>
                    <p className="text-xs text-[var(--q-on-dark-soft)]">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--q-hairline-soft)] bg-[var(--q-surface-soft)]">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-3 px-4 py-5 text-xs font-medium text-[var(--q-muted)] sm:px-6 lg:px-8">
          <span>Google · LINE 登入</span>
          <span>綠界 ECPay 金流託管</span>
          <span>7-11 / 全家 禮券兌換</span>
          <span>應用層 AES-256 個資加密</span>
        </div>
      </section>

      <section id="modes" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl leading-tight tracking-[-0.01em] text-[var(--q-ink)] sm:text-4xl">
            四種使用方式，一個帳號全包
          </h2>
          <p className="mt-3 max-w-2xl text-base text-[var(--q-muted)]">
            無論你是想取得樣本、還是想賺取回報，都能找到適合的模式。
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6">
              <p className="text-2xl">💰</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-ink)]">付費發問卷 · 精準媒合</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">
                設定獎勵與受眾條件（年齡 / 性別 / 地區 / 職業 / 興趣），系統把問卷推給最符合的填答者，
                並用 AI 三層審核擋掉灌水。每一分預算都花在真樣本。
              </p>
            </article>
            <article className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6">
              <p className="text-2xl">🎁</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-ink)]">填問卷 · 直接賺回報</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">
                完成問卷拿現金、7-11／全家／星巴克禮券或積分；積分可在商城兌換、或折抵。
                每天還能免費轉一次轉盤加碼，最高 200 點。
              </p>
            </article>
            <article className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6">
              <p className="text-2xl">🤝</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-ink)]">互惠交換 · 零預算拿樣本</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">
                沒有預算也能取得回覆：發一份互惠問卷進池，系統幫你配對另一個有問卷的人，
                雙方互填、AI 審過即同時解鎖。<a href="#mutual-flow" className="text-[var(--q-primary)] underline">看互惠運作 →</a>
              </p>
            </article>
            <article className="rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6">
              <p className="text-2xl">✨</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-ink)]">AI 協助製作 + 個人化推薦</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">
                發問卷方可讓 AI 生成問卷草稿、並建議在中段插入反機器人題；
                填問卷方填好個人資料後，平台主動推薦最適合你的問卷來填、賺更多回報。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        id="mutual-flow"
        className="bg-[var(--q-surface-dark)] py-20 text-[var(--q-on-dark)]"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--q-on-dark-soft)]">
            模式之一 · 互惠交換
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-tight tracking-[-0.01em] sm:text-4xl">
            沒預算？互惠也能拿到真實樣本
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-6">
              <p className="text-xs text-[var(--q-on-dark-soft)]">步驟 01</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-on-dark)]">發一份互惠問卷</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
                問卷送進配對池，免設獎勵、免鎖預算，先讓系統幫你找最合適的互填對手。
              </p>
            </article>
            <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-6">
              <p className="text-xs text-[var(--q-on-dark-soft)]">步驟 02</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-on-dark)]">30 秒內配對對手</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
                同分類優先媒合；若同分類暫時不足，系統自動改用 FIFO 配對，讓流量不空轉。
              </p>
            </article>
            <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-6">
              <p className="text-xs text-[var(--q-on-dark-soft)]">步驟 03</p>
              <h3 className="mt-3 text-lg font-semibold text-[var(--q-on-dark)]">
                互填後 AI 審過再解鎖
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
                任一方品質不過會自動退件，並把你的問卷放回池中，直到拿到符合標準的回覆。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl leading-tight tracking-[-0.01em] text-[var(--q-ink)] sm:text-4xl">
            拒絕垃圾數據，每一分預算都花在真樣本
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {aiLayers.map((layer) => (
              <article key={layer.title} className="rounded-xl bg-[var(--q-surface-card)] p-6">
                <h3 className="text-lg font-semibold text-[var(--q-ink)]">{layer.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--q-body)]">{layer.description}</p>
              </article>
            ))}
          </div>
          <div className="mt-10 rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-soft)] p-6">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--q-muted)]">
              <span>品質分數軸</span>
              <span>灰區 AI 介入</span>
            </div>
            <div className="mt-4 h-3 rounded-full bg-[var(--q-surface-cream-strong)]">
              <div className="relative h-full w-[74%] rounded-full bg-[var(--q-primary)]">
                <span className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-[var(--q-canvas)] bg-[var(--q-accent-teal)]" />
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--q-muted)]">
              分數落在約 40–75 的灰區樣本，才會交由 AI 灰區裁決做深度語義分析。
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--q-surface-dark)] py-20 text-[var(--q-on-dark)]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-7">
            <h2 className="font-serif text-3xl tracking-[-0.01em]">雙邊媒合，讓問卷方找到對的人</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
              <li>受眾篩選媒合，優先導入符合條件的填答者。</li>
              <li>AI 品質過濾，自動擋下低品質與可疑樣本。</li>
              <li>綠界自動分潤與退款，平台零持股金流託管。</li>
            </ul>
          </article>
          <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-7">
            <h2 className="font-serif text-3xl tracking-[-0.01em]">填答者拿到想要的在地獎勵</h2>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
              <li>填答賺現金、7-11 / 全家禮券與積分回饋。</li>
              <li>通過驗證即入帳「我的收益」，流程透明可追蹤。</li>
              <li>收益面板可同時查看 NT$、禮券與託管狀態。</li>
            </ul>
            <div className="mt-6 rounded-lg border border-white/10 bg-[var(--q-surface-dark-soft)] p-4">
              <p className="text-xs text-[var(--q-on-dark-soft)]">我的收益</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--q-on-dark)]">NT$ 2,860</p>
              <p className="mt-2 text-xs text-[var(--q-accent-teal)]">綠界託管中 · 入帳成功</p>
            </div>
          </article>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl leading-tight tracking-[-0.01em] text-[var(--q-ink)] sm:text-4xl">
            一個帳號，發問卷、填問卷、跑互惠
          </h2>
          <div className="mt-8 grid gap-4 rounded-xl bg-[var(--q-surface-card)] p-6 md:grid-cols-3">
            <article className="rounded-lg bg-[var(--q-canvas)] p-5">
              <p className="text-xs font-semibold text-[var(--q-muted)]">發問卷</p>
              <p className="mt-3 text-sm text-[var(--q-body)]">
                建立受眾條件、設定預算與獎勵，發布後由系統自動媒合與審核。
              </p>
            </article>
            <article className="rounded-lg bg-[var(--q-canvas)] p-5">
              <p className="text-xs font-semibold text-[var(--q-muted)]">填問卷</p>
              <p className="mt-3 text-sm text-[var(--q-body)]">
                依偏好接案填答，驗證通過後收益立即進入待領獎勵與我的收益面板。
              </p>
            </article>
            <article className="rounded-lg bg-[var(--q-canvas)] p-5">
              <p className="text-xs font-semibold text-[var(--q-muted)]">互惠</p>
              <p className="mt-3 text-sm text-[var(--q-body)]">
                沒有預算也能上線，透過互填交換快速累積有效樣本數。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[var(--q-surface-dark)] py-20 text-[var(--q-on-dark)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl tracking-[-0.01em] sm:text-4xl">信任三件套</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-6">
              <h3 className="text-lg font-semibold">信譽積分系統</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
                為每位填答者建立永久信任檔案，提升高品質用戶的接案優先權。
              </p>
            </article>
            <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-6">
              <h3 className="text-lg font-semibold">綠界金流託管</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
                預算自動鎖定與發放，平台帳上維持零持股，流程合規可稽核。
              </p>
            </article>
            <article className="rounded-xl bg-[var(--q-surface-dark-elevated)] p-6">
              <h3 className="text-lg font-semibold">端到端個資加密</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--q-on-dark-soft)]">
                敏感資料採用 AES-256-GCM 保護，從傳輸到儲存都維持高強度安全。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[var(--q-primary)] py-20 text-[var(--q-on-primary)]">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl leading-tight tracking-[-0.01em] sm:text-4xl">
            準備好收到真實的回覆了嗎？
          </h2>
          <p className="mt-4 text-base text-[var(--q-on-primary)]/90">
            免費註冊，幾分鐘就能發出第一份問卷，或立刻開始互惠交換。
          </p>
          <Link
            href="/auth/register"
            className="q-btn-anim mt-8 inline-block rounded-md bg-[var(--q-canvas)] px-6 py-3 text-sm font-semibold text-[var(--q-ink)] transition hover:bg-[var(--q-surface-soft)]"
          >
            免費開始
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
