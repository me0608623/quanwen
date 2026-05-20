import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "隱私政策",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> 返回首頁
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">隱私政策</h1>
      <p className="mb-10 text-sm text-slate-500">最後更新：2026 年 5 月 · Closed Beta 版本</p>

      <div className="prose prose-slate max-w-none space-y-8 text-sm leading-relaxed text-slate-700">
        <Section title="1. 我們蒐集哪些資料">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>帳號資料：</strong>Email、顯示名稱、OAuth 識別子（Google／Apple／LINE）</li>
            <li><strong>答題行為訊號：</strong>作答時間、滑動模式、完成率（用於 AI 品質審核）</li>
            <li><strong>裝置與日誌：</strong>IP 位址、瀏覽器類型、操作時間戳（安全與防詐用途）</li>
            <li><strong>金融資料：</strong>提領所需的匯款帳號或禮券兌換記錄（加密儲存）</li>
          </ul>
        </Section>

        <Section title="2. 我們如何使用資料">
          <ul className="list-disc space-y-1 pl-5">
            <li>驗證身份、提供核心媒合與獎勵服務</li>
            <li>透過 AI 管線偵測異常填答，保護問券方的資料品質</li>
            <li>產生匿名統計報告供問券方下載（不含個人識別資訊）</li>
            <li>寄送交易通知（獎勵入帳、任務截止提醒）</li>
          </ul>
        </Section>

        <Section title="3. 資料分享">
          <ul className="list-disc space-y-1 pl-5">
            <li>我們<strong>不</strong>出售您的個人資料給任何第三方。</li>
            <li>為提供服務，我們使用以下處理方：AWS（儲存）、Resend（Email）、Stripe（支付）——皆受嚴格保密協議約束。</li>
            <li>依法律要求或政府機關命令，我們可能須揭露必要資料。</li>
          </ul>
        </Section>

        <Section title="4. 資料保留">
          帳號資料在您主動刪除帳號後 30 天內清除。答題行為訊號以匿名化形式保留最多 2 年，用於持續改善 AI 品質模型。
        </Section>

        <Section title="5. 您的權利">
          依個人資料保護法，您有權：查閱、更正、刪除您的個人資料，及要求停止蒐集處理。
          請寄信至{" "}
          <a href="mailto:privacy@quanwen.tw" className="text-[#1F6FEB] underline hover:opacity-80">
            privacy@quanwen.tw
          </a>{" "}
          行使上述權利，我們將於 14 工作天內回覆。
        </Section>

        <Section title="6. Cookie 與追蹤">
          我們使用 Session Cookie 維持登入狀態，不使用跨站追蹤 Cookie 或廣告像素。
        </Section>

        <Section title="7. 安全措施">
          所有傳輸使用 TLS 加密；密碼以 bcrypt 雜湊儲存；金融資料加密靜置。我們定期進行安全審查，但無法保證絕對安全。
        </Section>

        <Section title="8. 條款連結">
          本隱私政策與{" "}
          <Link href="/terms" className="text-[#1F6FEB] underline hover:opacity-80">
            服務條款
          </Link>{" "}
          共同構成您與券問的使用協議。
        </Section>

        <Section title="9. 聯絡我們">
          隱私相關問題：
          <a href="mailto:privacy@quanwen.tw" className="text-[#1F6FEB] underline hover:opacity-80">
            privacy@quanwen.tw
          </a>
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
