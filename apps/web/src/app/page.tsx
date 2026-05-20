import Link from "next/link";

type SurveyTile = {
  title: string;
  subtitle: string;
  kind: "single" | "multi" | "likert" | "nps" | "ranking" | "open" | "matrix" | "slider";
  pos: string;
  delay: string;
};

const navItems = ["平台優勢", "解決方案", "題型範本", "方案價格", "客戶故事", "資源中心", "客服支援"];
const trustBrands = ["Retail", "Finance", "Automotive", "Healthcare", "SaaS", "Public Sector"];

const journey = [
  { title: "建立問卷", desc: "使用範本與題型組合，快速建立專業問卷" },
  { title: "推送與回收", desc: "跨裝置填答流暢，提升回收率與完成率" },
  { title: "洞察分析", desc: "即時彙整數據，快速產出可行決策資訊" },
];

const TILES: SurveyTile[] = [
  { title: "單選題", subtitle: "品牌偏好", kind: "single", pos: "top-[8%] left-[6%]", delay: "0ms" },
  { title: "多選題", subtitle: "使用情境", kind: "multi", pos: "top-[18%] left-[30%]", delay: "380ms" },
  { title: "Likert 量表", subtitle: "滿意度 1-5", kind: "likert", pos: "top-[10%] right-[16%]", delay: "760ms" },
  { title: "NPS", subtitle: "推薦意願 0-10", kind: "nps", pos: "top-[36%] left-[12%]", delay: "520ms" },
  { title: "排序題", subtitle: "需求優先級", kind: "ranking", pos: "top-[42%] left-[39%]", delay: "1100ms" },
  { title: "開放題", subtitle: "改善建議", kind: "open", pos: "top-[34%] right-[9%]", delay: "240ms" },
  { title: "矩陣題", subtitle: "功能評分", kind: "matrix", pos: "bottom-[20%] left-[24%]", delay: "920ms" },
  { title: "滑桿題", subtitle: "價格敏感度", kind: "slider", pos: "bottom-[10%] right-[18%]", delay: "1300ms" },
];

const highlights = [
  {
    no: "01",
    title: "進階題型與邏輯流程",
    subtitle: "讓回覆更精準可用",
    desc: "支援多種題型、條件跳題與回覆驗證，減少無效樣本並提升資料品質。",
  },
  {
    no: "02",
    title: "團隊協作與權限分層",
    subtitle: "大型專案也能穩定推進",
    desc: "可依角色分配權限與檢視範圍，建立可追蹤、可審核的協作流程。",
  },
  {
    no: "03",
    title: "企業級安全與整合",
    subtitle: "兼顧治理與擴充",
    desc: "支援稽核需求、資料保護與 API 串接，讓問卷流程更容易融入既有系統。",
  },
];

const industries = ["餐飲", "汽車", "金融保險", "醫療", "旅遊", "公部門", "零售", "科技"];

const footerCols = [
  {
    title: "產品方案",
    items: ["Basic", "Pro", "Team", "Enterprise", "Experience", "方案比較"],
  },
  {
    title: "產業應用",
    items: ["餐飲", "汽車", "金融保險", "醫療", "旅遊", "公部門", "零售", "科技"],
  },
  {
    title: "商業情境",
    items: ["市場研究", "活動管理", "客戶經營", "行銷優化", "人資調查", "課程回饋"],
  },
  {
    title: "擴充服務",
    items: ["Audience", "Event Tickets", "Lead Capture", "身份驗證", "Webhook / API"],
  },
  {
    title: "資源",
    items: ["部落格", "指南文件", "線上活動", "支援中心"],
  },
  {
    title: "關於",
    items: ["公司介紹", "合作夥伴", "客戶故事", "工作機會", "新聞", "聯絡我們"],
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7fafc] text-slate-900">
      <section className="relative overflow-hidden bg-[#071a36] text-white">
        <MosaicBg />
        <div className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-6 lg:px-10 lg:pb-24">
          <header className="mb-14 flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-lg font-black text-[#0f6d8a]">券</div>
              <div>
                <div className="text-lg font-bold">quanwen-logo</div>
                <div className="text-[11px] tracking-[1.5px] text-cyan-100/80">QUANWEN SURVEY CLOUD</div>
              </div>
            </div>

            <nav className="hidden items-center gap-5 text-[13px] text-white/85 xl:flex">
              {navItems.map((item) => (
                <a key={item} className="transition-colors hover:text-white" href="#">
                  {item}
                </a>
              ))}
              <button className="rounded-md border border-white/25 px-3 py-1.5 hover:bg-white/10">繁體中文</button>
            </nav>

            <div className="flex items-center gap-2">
              <Link href="/auth/login" className="rounded-[10px] border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                登入
              </Link>
              <Link href="/auth/register" className="rounded-[10px] bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-cyan-200">
                註冊
              </Link>
            </div>
          </header>

          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                企業級雲端問卷平台
              </p>
              <h1 className="mb-5 text-4xl font-extrabold leading-[1.15] tracking-tight lg:text-6xl">
                不只收集回覆，
                <br />
                更把資料轉成決策動能
              </h1>
              <p className="mb-8 max-w-2xl text-base leading-relaxed text-slate-200/90 lg:text-lg">
                從問卷設計、樣本回收到結果洞察，一站式整合調查流程，
                讓團隊用更短時間得到更可信的結論。
              </p>
              <Link href="/auth/register" className="inline-flex rounded-[10px] bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-cyan-300/25 hover:-translate-y-0.5 hover:bg-cyan-200">
                免費建立問卷
              </Link>
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <div className="mb-3 text-xs font-semibold tracking-wide text-cyan-100">三步完成調查任務</div>
              <div className="space-y-3">
                {journey.map((item, idx) => (
                  <div key={item.title} className="rounded-xl border border-white/15 bg-slate-900/30 p-3.5">
                    <div className="mb-1 text-sm font-bold text-white">{idx + 1}. {item.title}</div>
                    <div className="text-xs text-slate-200/85">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-2 text-xs text-cyan-50/85">
            {trustBrands.map((b) => (
              <span key={b} className="rounded-full border border-white/20 bg-white/10 px-3 py-1">{b}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <h2 className="mb-8 text-2xl font-extrabold tracking-tight lg:text-3xl">最專業的產業解決方案</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {industries.map((name) => (
            <div key={name} className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold shadow-sm">{name}</div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <div className="grid gap-4 lg:grid-cols-3">
          {highlights.map((item) => (
            <article key={item.no} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-2 text-xs font-black tracking-[1.4px] text-cyan-700">{item.no}</div>
              <h3 className="text-xl font-bold leading-tight">{item.title}</h3>
              <p className="mt-1 text-sm font-semibold text-cyan-700">{item.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.desc}</p>
              <button className="mt-5 rounded-lg border border-cyan-200 px-3 py-1.5 text-xs font-bold text-cyan-700 hover:bg-cyan-50">了解更多</button>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <div className="mb-2 text-xs font-semibold tracking-widest text-cyan-200/80">CASE</div>
              <h2 className="text-2xl font-extrabold">客戶故事與導入成果</h2>
            </div>
            <div className="text-xs text-slate-300">03 / 05</div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
            <p className="text-base leading-relaxed text-slate-100/95">
              「導入平台後，我們在活動報名與客戶調查的執行效率明顯提升，
              問卷品質與跨部門協作也更穩定。」
            </p>
            <div className="mt-4 text-sm font-semibold text-cyan-100">企業客戶，行銷營運主管</div>
          </div>

          <div className="mt-5 flex justify-end gap-2 text-xs">
            <button className="rounded-md border border-white/25 px-3 py-1.5 hover:bg-white/10">prev</button>
            <button className="rounded-md border border-white/25 px-3 py-1.5 hover:bg-white/10">next</button>
          </div>
        </div>
      </section>

      <section className="bg-[#0f6d8a] text-white">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10">
          <h2 className="mb-3 text-3xl font-extrabold">現在就開始你的問卷調查</h2>
          <p className="mx-auto mb-7 max-w-2xl text-slate-100/90">多元題型與進階分析功能，協助你打造更高品質的調查流程。</p>
          <Link href="/auth/register" className="inline-flex rounded-[10px] bg-white px-6 py-3 text-sm font-bold text-[#0f6d8a] hover:bg-cyan-50">
            免費建立問卷
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {footerCols.map((col) => (
              <div key={col.title}>
                <h4 className="mb-3 text-sm font-bold text-slate-900">{col.title}</h4>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {col.items.map((item) => (
                    <li key={item}><a href="#" className="hover:text-cyan-700">{item}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 space-y-1 text-xs text-slate-500">
            <p>使用條款與條件｜隱私權保護政策</p>
            <p>券問科技股份有限公司（公司資訊可於此更新）</p>
            <p>© 2026 QuanWen, all rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function MosaicBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.24),transparent_32%),radial-gradient(circle_at_84%_28%,rgba(59,130,246,0.23),transparent_38%),radial-gradient(circle_at_68%_82%,rgba(16,185,129,0.21),transparent_42%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.11)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.11)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-[q-home-glow_8s_ease-in-out_infinite]" />
      <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl animate-[q-home-glow_9s_ease-in-out_infinite]" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl animate-[q-home-glow_10s_ease-in-out_infinite]" />

      <div className="absolute inset-0 hidden lg:block animate-[q-home-drift_14s_ease-in-out_infinite]">
        {TILES.map((tile) => (
          <QuestionTile key={`${tile.title}-${tile.pos}`} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function QuestionTile({ tile }: { tile: SurveyTile }) {
  return (
    <div
      className={`absolute ${tile.pos} w-[220px] rounded-2xl border border-white/20 bg-slate-900/35 p-3.5 backdrop-blur-md shadow-[0_18px_40px_-20px_rgba(8,145,178,0.45)] animate-[q-home-float_7s_ease-in-out_infinite]`}
      style={{ animationDelay: tile.delay }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">{tile.title}</span>
        <span className="text-[10px] text-slate-300/80">{tile.subtitle}</span>
      </div>
      <TileBody kind={tile.kind} />
    </div>
  );
}

function TileBody({ kind }: { kind: SurveyTile["kind"] }) {
  if (kind === "single" || kind === "multi") {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full border ${n === 2 ? "border-cyan-300 bg-cyan-300/30" : "border-white/45"}`} />
            <span className="h-2 w-full rounded bg-white/25" />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "likert") {
    return (
      <div>
        <div className="mb-2 h-2 w-32 rounded bg-white/20" />
        <div className="grid grid-cols-5 gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-2.5 rounded-full ${n === 3 ? "bg-cyan-300/80" : "bg-white/30"}`} />
          ))}
        </div>
      </div>
    );
  }

  if (kind === "nps") {
    return (
      <div>
        <div className="mb-2 h-2 w-36 rounded bg-white/20" />
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className={`h-2.5 rounded-sm ${i >= 8 ? "bg-emerald-300/70" : "bg-white/28"}`} />
          ))}
        </div>
      </div>
    );
  }

  if (kind === "ranking") {
    return (
      <div className="space-y-1.5">
        {["A", "B", "C"].map((l, idx) => (
          <div key={l} className="flex items-center gap-2">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-cyan-300/35 text-[9px] text-cyan-100">{idx + 1}</span>
            <span className="h-2 w-full rounded bg-white/25" />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "open") {
    return (
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded bg-white/25" />
        <div className="h-2 w-11/12 rounded bg-white/25" />
        <div className="h-2 w-8/12 rounded bg-white/25" />
      </div>
    );
  }

  if (kind === "matrix") {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map((r) => (
          <div key={r} className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((c) => (
              <span key={`${r}-${c}`} className={`h-2 rounded ${r === 1 && c === 2 ? "bg-cyan-300/80" : "bg-white/25"}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 h-2 w-28 rounded bg-white/20" />
      <div className="h-2.5 w-full rounded-full bg-white/30">
        <div className="h-full w-3/5 rounded-full bg-cyan-300/80" />
      </div>
    </div>
  );
}
