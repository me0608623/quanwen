import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "隱私權政策",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> 回到首頁
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">隱私權政策</h1>
      <p className="mb-10 text-sm text-slate-500">最後更新：2026 年 5 月 31 日</p>

      <div className="prose prose-slate max-w-none space-y-8 text-sm leading-relaxed text-slate-700">
        <Section title="1. 我們蒐集哪些資訊">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>帳號資訊：</strong>Email、登入方式（Email / Google / Apple / LINE）。</li>
            <li><strong>問卷與填答資料：</strong>你建立或提交的問卷內容與回答。</li>
            <li><strong>安全與風險控制資料：</strong>必要的技術紀錄，用於防止濫用與重複提交。</li>
          </ul>
        </Section>

        <Section title="2. Browser Fingerprinting（瀏覽器指紋）">
          <p>
            為了防止同一使用者重複提交問卷、維持獎勵發放公平性，我們會收集瀏覽器裝置特徵並產生一組穩定的識別碼（fingerprintId）。
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>收集內容：</strong>裝置/瀏覽器特徵計算後的穩定識別碼（hashed ID）。</li>
            <li><strong>用途：</strong>偵測同一問卷可能的重複提交與反詐欺分析。</li>
            <li><strong>不會用於：</strong>廣告投放、跨站追蹤、或出售給第三方。</li>
            <li><strong>保留期間：</strong>與問卷填答資料一致，最長 1 年。</li>
          </ul>
          <p>
            指紋僅作為風險訊號之一，不會作為唯一封鎖或拒絕依據。
          </p>
        </Section>

        <Section title="3. 我們如何使用資料">
          <ul className="list-disc space-y-1 pl-5">
            <li>提供問卷服務、計算回饋與維護平台運作。</li>
            <li>進行防濫用、反詐欺與系統安全監控。</li>
            <li>改善產品體驗與服務品質。</li>
          </ul>
        </Section>

        <Section title="4. 資料保存與刪除">
          <p>
            我們僅在服務必要期間保留資料。你可來信要求刪除帳號與個資；帳號刪除流程會一併清除與該帳號關聯的 fingerprint_id。
          </p>
        </Section>

        <Section title="5. 你的權利">
          <p>
            你可申請查詢、更正、刪除或限制使用你的個人資料。請聯繫
            {" "}
            <a href="mailto:privacy@quanwen.tw" className="text-[#1F6FEB] underline hover:opacity-80">
              privacy@quanwen.tw
            </a>
            。
          </p>
        </Section>

        <Section title="6. Cookie 與安全">
          <p>
            我們使用必要 Cookie 以維持登入狀態與安全機制，並採取傳輸加密、權限控管等措施保護資料。
          </p>
        </Section>

        <Section title="7. 其他條款">
          <p>
            請一併參考
            {" "}
            <Link href="/terms" className="text-[#1F6FEB] underline hover:opacity-80">
              服務條款
            </Link>
            。
          </p>
        </Section>
      </div>
    </div>
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
