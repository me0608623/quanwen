import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "服務條款",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> 返回首頁
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">服務條款</h1>
      <p className="mb-10 text-sm text-slate-500">最後更新：2026 年 5 月 · Closed Beta 版本</p>

      <div className="prose prose-slate max-w-none space-y-8 text-sm leading-relaxed text-slate-700">
        <Section title="1. 服務說明">
          券問（QuanWen）是一個雙邊問卷媒合平台，連結「需要蒐集問卷資料的問券方」與「願意填寫問卷以獲得獎勵的受試者」。
          使用本平台即表示您同意本條款。
        </Section>

        <Section title="2. 帳號與資格">
          <ul className="list-disc space-y-1 pl-5">
            <li>您必須年滿 18 歲（或在您所在地區的法定成年年齡）方可使用本服務。</li>
            <li>每人限一個帳號；禁止代他人建立帳號。</li>
            <li>您有責任保管帳號密碼，對帳號內的所有活動負責。</li>
          </ul>
        </Section>

        <Section title="3. 問券方義務">
          <ul className="list-disc space-y-1 pl-5">
            <li>問卷內容須符合法規，不得含有違法、歧視、誘導性或虛假資訊。</li>
            <li>問券方須在設定的時間內完成獎勵發放，不得無故拒絕有效回覆。</li>
            <li>問卷所蒐集的個人資料須遵守個人資料保護法及相關規定。</li>
          </ul>
        </Section>

        <Section title="4. 受試者義務">
          <ul className="list-disc space-y-1 pl-5">
            <li>回答須誠實、完整，不得亂填、重複作答或使用自動化工具。</li>
            <li>違反品質要求的回覆可能不計入有效作答，獎勵不予發放。</li>
            <li>禁止以技術手段繞過 AI 品質審核機制。</li>
          </ul>
        </Section>

        <Section title="5. 獎勵與付款">
          <ul className="list-disc space-y-1 pl-5">
            <li>獎勵金額以任務發布時公告為準，平台不額外擔保。</li>
            <li>現金提領須完成實名驗證；禮券兌換碼一經發出視為已履行。</li>
            <li>抽獎回饋由問卷建立者負責交付。平台作為流程保障人，會留存建立者承諾、開獎公平性證明、站內通知送達、兌獎說明、收件確認與爭議紀錄；電子券碼、領取方式、寄送流程或第三方兌換連結應透過平台通知送達中獎者。平台會對逾期案件介入追蹤與核驗，但不預設代替建立者提供獎品。</li>
            <li>平台對問卷結果及獎勵糾紛不負最終仲裁責任，但提供申訴管道。</li>
          </ul>
        </Section>

        <Section title="6. 隱私與資料">
          使用本服務即表示您同意我們的{" "}
          <Link href="/privacy" className="text-[#1F6FEB] underline hover:opacity-80">
            隱私政策
          </Link>
          ，包括蒐集答題行為訊號以維護平台品質。
        </Section>

        <Section title="7. 免責聲明">
          本服務以「現狀」提供，Closed Beta 期間可能有功能變動。券問不對因第三方原因（含支付系統、外部 OAuth 服務）造成的損失負責。
        </Section>

        <Section title="8. 修改條款">
          我們保留隨時修改本條款的權利。重大變更將透過 Email 或平台公告通知。繼續使用服務即視為接受修改後的條款。
        </Section>

        <Section title="9. 聯絡我們">
          如有問題請聯繫：
          <a href="mailto:legal@quanwen.tw" className="text-[#1F6FEB] underline hover:opacity-80">
            legal@quanwen.tw
          </a>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-slate-900">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
