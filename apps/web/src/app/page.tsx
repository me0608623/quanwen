import Link from "next/link";
import { LoadingScreen } from "@/components/marketing/animation/loading-screen";
import { HeroBackdrop } from "@/components/marketing/animation/hero-backdrop";
import { HeroIntro } from "@/components/marketing/animation/hero-intro";
import { ScrollReveal } from "@/components/marketing/animation/scroll-reveal";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const heroModes = [
  {
    icon: "付",
    title: "付費發問卷",
    desc: "設定受眾與獎勵，系統媒合合適填答者",
  },
  {
    icon: "填",
    title: "填問卷賺回報",
    desc: "現金、超商禮券與積分回到同一個錢包",
  },
  { icon: "互", title: "互惠交換", desc: "沒有預算也能用互填換取有效樣本" },
  {
    icon: "AI",
    title: "AI 協助製作",
    desc: "生成草稿、檢查題目、降低低品質回覆",
  },
];

const trustItems = [
  "Google / LINE 登入",
  "綠界 ECPay 金流託管",
  "7-11 / 全家禮券兌換",
  "個資應用層加密",
];

const modeCards = [
  {
    label: "For researchers",
    title: "付費發問卷，讓預算用在對的人身上",
    desc: "設定年齡、地區、職業與興趣等受眾條件，平台把問卷推給更符合條件的填答者，並用 AI 三層審核擋掉灌水樣本。",
  },
  {
    label: "For respondents",
    title: "填問卷，直接累積現金與在地獎勵",
    desc: "完成問卷後取得現金、7-11／全家／星巴克禮券或積分。收益集中在同一個面板，流程透明可追蹤。",
  },
  {
    label: "For zero budget",
    title: "互惠交換，用互填換到第一批真實回覆",
    desc: "發一份互惠問卷進池，系統配對另一位問卷方。雙方互填且通過品質審核後，同時解鎖有效樣本。",
    href: "#mutual-flow",
  },
  {
    label: "For builders",
    title: "AI 先打底，再由你決定問卷內容",
    desc: "從研究目的生成問卷草稿，並建議注意力檢核題。填答者完成個人資料後，也會收到更合適的問卷推薦。",
  },
];

const mutualSteps = [
  {
    step: "01",
    title: "把問卷送進互惠池",
    desc: "免設獎勵、免鎖預算。先交給系統尋找最合適的互填對手。",
  },
  {
    step: "02",
    title: "優先配對同類型需求",
    desc: "同分類問卷優先媒合。若暫時不足，系統改用先進先出配對，避免等待太久。",
  },
  {
    step: "03",
    title: "互填後通過品質審核",
    desc: "任一方品質不過會退回重配，直到拿到符合標準的回覆。",
  },
];

const aiLayers = [
  {
    title: "Layer 1 行為訊號偵測",
    description:
      "比對填答耗時、作答頻率與點擊模式，先攔下機器人與明顯亂填樣本。",
  },
  {
    title: "Layer 2 邏輯與注意力檢核",
    description: "搭配反向題與注意力檢核題，淘汰答非所問或注意力渙散的回覆。",
  },
  {
    title: "Layer 3 AI 灰區裁決",
    description: "分數落在灰區時啟動語義分析，針對可疑樣本做更精準的最終判定。",
  },
];

const antiAbuseCards = [
  {
    icon: "⏱",
    title: "填答頻率上限",
    desc: "每人每小時與每日填答數量設有限制，正常使用足夠，短時間刷量會被擋下。",
  },
  {
    icon: "⚡",
    title: "填太快即時警告",
    desc: "作答速度異常時會在填答中提醒，時間不足以閱讀的回覆不會發放獎勵。",
  },
  {
    icon: "偵",
    title: "自動化行為偵測",
    desc: "偵測連續快速填答與爬蟲式操作後，系統會暫停該帳號的填答資格。",
  },
  {
    icon: "信",
    title: "信譽分與停權",
    desc: "品質不佳會扣信譽分、降低接案優先權。連續退件則暫停接案。",
  },
];

const workflowCards = [
  {
    title: "10 秒匯入既有問卷",
    desc: "已經在 Google Forms、SurveyCake 或 Excel 做好問卷？貼上連結或檔案，系統解析題目與選項後即可上線。",
  },
  {
    title: "AI 數據分析報告",
    desc: "收完回覆後自動整理關鍵發現與交叉分析，並可匯出 PDF、Excel、CSV 原始資料或乾淨樣本。",
  },
  {
    title: "平台代辦公正抽獎",
    desc: "獎金託管、隨機抽出、自動通知中獎者並發獎。每次開獎都有公平性核對紀錄可稽核。",
  },
];

const trustCards = [
  {
    title: "信譽積分系統",
    desc: "為每位填答者建立長期信任檔案，讓高品質用戶更容易接到適合的問卷。",
  },
  {
    title: "綠界金流託管",
    desc: "預算自動鎖定與發放，平台帳上維持零持股，付款與退款流程可追蹤。",
  },
  {
    title: "個資加密保護",
    desc: "敏感資料採用 AES-256-GCM 保護，從傳輸到儲存都維持高強度安全。",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--q-canvas)] text-[var(--q-body)] antialiased">
      <LoadingScreen />
      <HeroIntro />
      <ScrollReveal />
      <MarketingNav />

      <section
        data-hero-root
        className="relative isolate mx-auto max-w-[1180px] px-4 pb-20 pt-12 sm:px-6 sm:pb-24 lg:px-8 lg:pb-28 lg:pt-20"
      >
        <HeroBackdrop />
        <div className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="max-w-3xl">
            <p data-hero-badge className="q-home-kicker">
              AI 把關的雙邊問卷平台
            </p>
            <h1
              data-hero-title
              className="mt-5 text-balance font-serif text-[clamp(3rem,4.8vw,4.3rem)] font-semibold leading-[0.92] tracking-[-0.055em] text-[var(--q-ink)]"
            >
              發問卷找對的人，
              <br />
              填問卷賺回報。
            </h1>
            <p
              data-hero-copy
              className="mt-7 max-w-[38rem] text-pretty text-lg leading-8 text-[var(--q-body-strong)] sm:text-xl sm:leading-9"
            >
              付費取樣、互惠交換、填答獎勵與 AI
              品質審核集中在同一個平台。研究者更快收到可信樣本，填答者也能清楚拿到回報。
            </p>
            <p
              data-hero-copy
              className="mt-4 max-w-[34rem] text-pretty text-sm leading-7 text-[var(--q-muted)]"
            >
              從問卷草稿、受眾媒合、反機器人檢核到金流託管，券問把收樣本的雜事整理成一條可追蹤的流程。
            </p>
            <div
              data-hero-cta
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Link
                href="/auth/register"
                className="q-btn q-btn-primary q-btn-anim"
              >
                免費開始
              </Link>
              <a href="#modes" className="q-btn q-btn-secondary q-btn-anim">
                看四種使用方式
              </a>
            </div>
          </div>

          <div data-hero-panel className="q-hero-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-[var(--q-on-dark-soft)]">
                  WORKSPACE
                </p>
                <h2 className="mt-3 font-serif text-3xl font-semibold leading-none tracking-[-0.035em] text-[var(--q-on-dark)] sm:text-4xl">
                  一個帳號，四種任務。
                </h2>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-[var(--q-on-dark-soft)]">
                live
              </span>
            </div>
            <div className="mt-7 grid gap-3">
              {heroModes.map((mode) => (
                <div
                  key={mode.title}
                  data-hero-panel-item
                  className="q-hero-mode"
                >
                  <span className="q-hero-mode-icon">{mode.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--q-on-dark)]">
                      {mode.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--q-on-dark-soft)]">
                      {mode.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--q-hairline-soft)] bg-[var(--q-surface-soft)]/80">
        <div className="mx-auto grid max-w-[1180px] gap-3 px-4 py-5 text-sm font-medium text-[var(--q-muted)] sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {trustItems.map((item) => (
            <span key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--q-primary)]" />
              {item}
            </span>
          ))}
        </div>
      </section>

      <section id="modes" className="q-home-section">
        <div className="q-home-container">
          <div className="max-w-3xl">
            <p className="q-home-kicker">四種使用方式</p>
            <h2 className="q-home-heading mt-4">
              不是再開一個表單工具，而是把樣本流動起來。
            </h2>
            <p className="q-home-lead mt-5">
              同一個帳號可以是問卷方、填答者，也可以用互惠模式先取得第一批回覆。
            </p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {modeCards.map((card, index) => (
              <article
                key={card.title}
                className={`q-home-card ${index === 0 ? "lg:translate-y-8" : ""}`}
              >
                <p className="q-card-label">{card.label}</p>
                <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--q-ink)]">
                  {card.title}
                </h3>
                <p className="mt-4 text-pretty text-sm leading-7 text-[var(--q-body)]">
                  {card.desc}
                </p>
                {card.href ? (
                  <a
                    href={card.href}
                    className="mt-5 inline-flex text-sm font-semibold text-[var(--q-primary-active)] underline-offset-4 hover:underline"
                  >
                    看互惠運作
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="mutual-flow"
        className="q-home-section q-home-section-tinted"
      >
        <div className="q-home-container">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="q-home-kicker">互惠交換</p>
              <h2 className="q-home-heading mt-4">
                沒有預算，也能拿到可用的真實樣本。
              </h2>
              <p className="q-home-lead mt-5">
                互惠不是把品質放低，而是讓雙方都完成同等任務，再由系統審核後解鎖回覆。
              </p>
            </div>
            <div className="grid gap-3">
              {mutualSteps.map((step) => (
                <article key={step.step} className="q-step-card">
                  <span className="font-mono text-sm font-semibold tabular-nums text-[var(--q-primary-active)]">
                    {step.step}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--q-ink)]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--q-body)]">
                      {step.desc}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="q-home-section">
        <div className="q-home-container">
          <div className="max-w-3xl">
            <p className="q-home-kicker">品質審核</p>
            <h2 className="q-home-heading mt-4">
              拒絕垃圾數據，每一分預算都花在真樣本。
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {aiLayers.map((layer) => (
              <article
                key={layer.title}
                className="q-home-card q-home-card-flat"
              >
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--q-ink)]">
                  {layer.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--q-body)]">
                  {layer.description}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-8 rounded-[1.75rem] border border-[var(--q-hairline)] bg-[var(--q-surface-soft)] p-6 shadow-[0_18px_60px_rgba(55,47,35,0.08)]">
            <div className="flex items-center justify-between text-xs font-semibold tracking-[0.08em] text-[var(--q-muted)]">
              <span>品質分數軸</span>
              <span>灰區 AI 介入</span>
            </div>
            <div className="mt-5 h-3 rounded-full bg-[var(--q-surface-cream-strong)]">
              <div className="relative h-full w-[74%] rounded-full bg-[var(--q-primary)]">
                <span className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-[var(--q-canvas)] bg-[var(--q-accent-teal)] shadow-[0_0_0_6px_rgba(93,184,166,0.18)]" />
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--q-muted)]">
              分數落在約 40 到 75 的灰區樣本，才會交由 AI
              灰區裁決做深度語義分析。
            </p>
          </div>
        </div>
      </section>

      <section className="q-home-section q-home-section-tinted">
        <div className="q-home-container">
          <div className="max-w-3xl">
            <p className="q-home-kicker">防刷機制</p>
            <h2 className="q-home-heading mt-4">獎勵只發給認真填答的人。</h2>
            <p className="q-home-lead mt-5">
              多重防濫用機制守住每一份問卷的品質，讓問卷方拿到真實樣本，填答方公平競爭。
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {antiAbuseCards.map((card) => (
              <article key={card.title} className="q-mini-card">
                <span className="q-mini-icon">{card.icon}</span>
                <h3 className="mt-5 text-base font-semibold tracking-[-0.02em] text-[var(--q-ink)]">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--q-body)]">
                  {card.desc}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-7 max-w-3xl text-xs leading-6 text-[var(--q-muted)]">
            搭配 AI 三層品質審核，從填答行為到答案內容雙重把關。
          </p>
        </div>
      </section>

      <section className="q-home-section">
        <div className="q-home-container">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="q-home-kicker">從建立到分析</p>
              <h2 className="q-home-heading mt-4">
                匯入、分析、抽獎，平台都幫你收好。
              </h2>
              <p className="q-home-lead mt-5">
                不用從零開始，也不用自己跑統計、自己辦抽獎。券問把收樣本後的收尾工作一起整理好。
              </p>
            </div>
            <div className="rounded-[2rem] bg-[var(--q-surface-dark)] p-5 text-[var(--q-on-dark)] shadow-[0_30px_90px_rgba(24,23,21,0.18)] sm:p-7">
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--q-on-dark-soft)]">
                SAMPLE STATUS
              </p>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-[var(--q-on-dark)]">
                286
              </p>
              <p className="mt-2 text-sm text-[var(--q-on-dark-soft)]">
                乾淨樣本已通過品質審核
              </p>
            </div>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {workflowCards.map((card) => (
              <article key={card.title} className="q-home-card">
                <h3 className="text-xl font-semibold tracking-[-0.025em] text-[var(--q-ink)]">
                  {card.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--q-body)]">
                  {card.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="q-home-section q-home-section-tinted">
        <div className="q-home-container grid gap-5 lg:grid-cols-2">
          <article className="q-proof-card">
            <h2 className="font-serif text-4xl font-semibold leading-tight tracking-[-0.04em] text-[var(--q-ink)]">
              雙邊媒合，讓問卷方找到對的人。
            </h2>
            <ul className="mt-7 space-y-4 text-sm leading-7 text-[var(--q-body)]">
              <li>受眾篩選媒合，優先導入符合條件的填答者。</li>
              <li>AI 品質過濾，自動擋下低品質與可疑樣本。</li>
              <li>綠界自動分潤與退款，平台零持股金流託管。</li>
            </ul>
          </article>
          <article className="q-proof-card q-proof-card-dark">
            <h2 className="font-serif text-4xl font-semibold leading-tight tracking-[-0.04em] text-[var(--q-on-dark)]">
              填答者拿到想要的在地獎勵。
            </h2>
            <ul className="mt-7 space-y-4 text-sm leading-7 text-[var(--q-on-dark-soft)]">
              <li>填答賺現金、超商禮券與積分回饋。</li>
              <li>通過驗證即入帳我的收益，流程透明可追蹤。</li>
              <li>收益面板可同時查看 NT$、禮券與託管狀態。</li>
            </ul>
            <div className="mt-8 rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs text-[var(--q-on-dark-soft)]">我的收益</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--q-on-dark)]">
                NT$ 2,860
              </p>
              <p className="mt-2 text-xs text-[var(--q-accent-teal)]">
                綠界託管中 · 入帳成功
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="q-home-section">
        <div className="q-home-container">
          <div className="max-w-3xl">
            <p className="q-home-kicker">信任基礎</p>
            <h2 className="q-home-heading mt-4">
              每一筆回覆，都要能被追蹤與信任。
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {trustCards.map((card) => (
              <article
                key={card.title}
                className="q-home-card q-home-card-flat"
              >
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--q-ink)]">
                  {card.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[var(--q-body)]">
                  {card.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1180px] rounded-[2.25rem] bg-[var(--q-primary)] px-6 py-14 text-center text-[var(--q-on-primary)] shadow-[0_30px_90px_rgba(169,88,62,0.22)] sm:px-10 lg:py-16">
          <h2 className="mx-auto max-w-2xl text-balance font-serif text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
            準備好收到真實的回覆了嗎？
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-8 text-[var(--q-on-primary)]/90">
            免費註冊，幾分鐘就能發出第一份問卷，或立刻開始互惠交換。
          </p>
          <Link
            href="/auth/register"
            className="q-btn q-btn-invert q-btn-anim mt-8"
          >
            免費開始
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
