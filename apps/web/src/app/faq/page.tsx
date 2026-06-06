import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const faqGroups: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "填問卷 · 賺獎勵",
    items: [
      { q: "填問卷可以拿到什麼？", a: "依問卷設定，可拿現金（NT$）、7-11／全家／星巴克禮券或平台積分。積分可在商城兌換或折抵。每完成一份問卷還會 +1 次轉盤抽獎機會，最高 200 點。" },
      { q: "獎勵什麼時候入帳？", a: "填答通過品質審核後，獎勵會進入「待領獎勵／我的收益」。固定獎勵問卷自動發放；抽獎型問卷則於開獎後通知中獎者。" },
      { q: "為什麼我的填答被退件？", a: "每份填答會經 AI 三層品質審核（行為訊號、邏輯檢核、AI 灰區裁決）。分數 ≥80 通過、50–79 可疑、<50 退件。退件可在「填答紀錄」提出申訴，由管理員人工複核。" },
      { q: "一天可以填幾份？", a: "為維持品質與防止刷量，每人每小時、每日填答數量設有上限；正常使用綽綽有餘。填答過快會跳出提醒，異常快速或自動化填答會被系統暫停一段時間。" },
    ],
  },
  {
    group: "發問卷 · 取得樣本",
    items: [
      { q: "有哪幾種發問卷方式？", a: "三種：① 標準（付費取樣，平台媒合受試者）② 互惠（兩人互填，零預算交換樣本）③ 外部問卷連結（已有 Google 表單等，平台只做公布與媒合，填答者跳轉填寫）。" },
      { q: "如何確保樣本品質？", a: "受眾條件鎖定 + AI 三層審核 + 防刷機制（頻率上限、填太快偵測、機器人封禁）+ 信譽系統，從填答行為到答案內容雙重把關。" },
      { q: "預算怎麼計費？", a: "發布時鎖定預算，逐份發放獎勵；無效樣本不計費，未使用的預算於問卷關閉後退回。平台收取 15% 服務費。" },
    ],
  },
  {
    group: "金流 · 提領",
    items: [
      { q: "如何儲值？", a: "透過綠界 ECPay，單筆 NT$100–100,000，平台全程託管。" },
      { q: "如何提領收益？", a: "最低 NT$300、每日上限 NT$30,000；提領金額 ≥ NT$2,000 需先通過 KYC 身分驗證。" },
      { q: "我的個資安全嗎？", a: "身分證、銀行帳號等敏感資料以 AES-256-GCM 加密保存；所有金額以新台幣整數計算，雙向分錄可稽核。" },
    ],
  },
  {
    group: "帳號 · 登入",
    items: [
      { q: "可以用什麼方式登入？", a: "支援 Email／密碼、Google、LINE 登入。" },
      { q: "一個帳號可以同時發問卷和填問卷嗎？", a: "可以。每個帳號同時擁有發卷者與填答者身分，免切換。" },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-3xl px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]">FAQ</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">常見問題</h1>
        <p className="mt-4 text-base text-[var(--q-muted)]">關於填問卷、發問卷、金流與帳號的常見疑問。找不到答案？歡迎<Link href="/contact" className="text-[var(--q-primary)] underline">聯絡我們</Link>。</p>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-3xl space-y-8 px-4 sm:px-6 lg:px-8">
          {faqGroups.map((g) => (
            <div key={g.group}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--q-primary)]">{g.group}</h2>
              <div className="space-y-2">
                {g.items.map((it) => (
                  <details key={it.q} className="group rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--q-ink)] marker:hidden">
                      <span className="mr-2 text-[var(--q-muted)] group-open:rotate-90 inline-block transition-transform">▸</span>
                      {it.q}
                    </summary>
                    <p className="mt-2 pl-5 text-sm leading-relaxed text-[var(--q-body)]">{it.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
