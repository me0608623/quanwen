'use client';

import Link from 'next/link';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="font-semibold text-foreground">{label}</span>
      {children}
    </p>
  );
}

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">使用說明</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          券問是「AI 把關 + 雙邊自助」的問卷媒合平台。一個帳號就能發問卷、填問卷、賺獎勵。以下說明各項功能與規則。
        </p>
      </div>

      <div className="space-y-4">
        <Section title="① 發問卷（三種方式）">
          <Item label="標準（付費取樣）：">
            設定每份獎勵與受眾條件（年齡 / 性別 / 地區 / 職業 / 興趣），平台把問卷推給最符合的填答者，並用 AI 三層審核擋掉灌水。發布時鎖定預算，逐份發獎。
          </Item>
          <Item label="互惠（兩人互填）：">
            沒有預算也能取得回覆。發一份互惠問卷進配對池，系統幫你配對另一個有問卷的人，雙方互填、AI 審過即同時解鎖看對方答案。
          </Item>
          <Item label="外部問卷連結：">
            已用 Google 表單 / SurveyMonkey 等外部平台時，貼上連結即可。平台只做公布與媒合，填答者會在問卷池看到並跳轉到你的頁面填寫（站內不出題、不審核）；獎勵由你依填答結果自行發放。需填寫預估填答分鐘數。
          </Item>
          <Item label="AI 協助：">
            可讓 AI 生成問卷草稿、並建議插入反機器人題；也能從範本快速開始。
          </Item>
        </Section>

        <Section title="② 填問卷賺獎勵">
          <Item label="獎勵形式：">
            完成問卷可拿現金（NT$）、7-11 / 全家 / 星巴克禮券，或積分。積分可在商城兌換或折抵。
          </Item>
          <Item label="問卷池資訊：">
            每張任務卡會標示預估填寫分鐘、獎勵內容、剩餘份數，外部問卷另有「🔗 外部問卷」標記。
          </Item>
          <Item label="轉盤加碼：">
            每完成一份問卷 +1 次轉盤抽獎機會，最高 200 點。
          </Item>
        </Section>

        <Section title="③ AI 三層品質審核（為什麼有時會被退件）">
          <p>每份填答會經過三層把關，計算 0–100 的品質分數：</p>
          <Item label="Layer 1 行為訊號：">即時比對填答耗時、作答頻率與點擊模式，攔下機器人與亂填。</Item>
          <Item label="Layer 2 邏輯檢核：">反向題與注意力檢核題，淘汰答非所問。</Item>
          <Item label="Layer 3 AI 灰區裁決：">分數落在灰區（約 50–79）時才啟動深度語義分析。</Item>
          <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <p><span className="font-semibold text-foreground">分數規則：</span>≥ 80 通過、自動發獎；50–79 可疑、可能由 AI 複判；&lt; 50 退件、不發獎。</p>
            <p className="mt-1">退件可在「填答紀錄」提出<span className="font-semibold text-foreground">申訴</span>，由管理員人工複核。連續多次退件可能暫時停權。</p>
          </div>
        </Section>

        <Section title="④ 信譽積分">
          <p>系統為每位填答者建立永久信任檔案。認真作答會累積信譽分，提升接案優先權；異常或退件會扣分。維持好信譽能拿到更多、更好的問卷。</p>
        </Section>

        <Section title="⑤ 錢包與金流（綠界 ECPay 託管）">
          <Item label="收益：">通過審核的獎勵進入「待領獎勵 / 我的收益」，可查看現金、禮券與託管狀態。</Item>
          <Item label="儲值（發問卷方）：">透過綠界 ECPay，單筆 NT$100–100,000。平台帳上零持股，全程託管。</Item>
          <Item label="提領：">最低 NT$300、每日上限 NT$30,000；提領 ≥ NT$2,000 需先通過 KYC 身分驗證。</Item>
          <Item label="平台手續費：">每筆獎勵發放收取 10% 服務費。</Item>
          <p className="text-xs">所有金額以新台幣整數計算；身分證、銀行帳號等個資以 AES-256 加密保存。</p>
        </Section>

        <Section title="⑥ 轉盤、積分商城與訂閱">
          <Item label="轉盤抽獎：">完成問卷累積抽獎次數，轉一次最高 200 點，獎項即時入帳。</Item>
          <Item label="積分商城：">用累積的積分兌換禮券、折抵或訂閱天數。</Item>
          <Item label="VIP / VVIP：">付費訂閱可提高每日 AI 功能（草稿生成、洞察等）使用額度。Free 5 次/日、VIP 50 次/日、VVIP 300 次/日。</Item>
        </Section>

        <Section title="⑦ 帳號與安全">
          <Item label="一個帳號雙角色：">同一帳號可同時發問卷與填問卷，免切換。</Item>
          <Item label="登入：">支援 Email / 密碼、Google、LINE 登入。</Item>
          <Item label="綁定與安全：">可在「帳號設定」綁定第三方登入；「安全」頁管理密碼與防護。OAuth 不會自動用 email 合併既有帳號，需登入後手動綁定。</Item>
        </Section>

        <Section title="核心規則速查">
          <ul className="list-disc space-y-1 pl-5">
            <li>品質分 ≥ 80 通過發獎、50–79 可疑、&lt; 50 退件</li>
            <li>退件可申訴；連續退件可能停權</li>
            <li>問卷發布即上架，AI 只提供品質建議、不退件不擋發布</li>
            <li>平台手續費 10%；金額一律新台幣整數</li>
            <li>儲值 NT$100–100,000；提領 NT$300 起、每日上限 NT$30,000、≥NT$2,000 需 KYC</li>
            <li>每完成一份問卷 +1 次轉盤；轉盤最高 200 點</li>
            <li>外部問卷由建立者自行發放獎勵，平台不代為審核</li>
          </ul>
        </Section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard" className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90">
          去發問卷
        </Link>
        <Link href="/tasks" className="rounded-md border border-border px-4 py-2 font-semibold hover:bg-muted">
          去填問卷
        </Link>
        <Link href="/faq" className="rounded-md border border-border px-4 py-2 font-semibold hover:bg-muted">
          常見問題
        </Link>
      </div>
    </main>
  );
}
