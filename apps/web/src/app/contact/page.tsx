"use client";

import { useState } from "react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

const SUPPORT_EMAIL = "me0608623@gmail.com";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const canSend = name.trim() && message.trim();

  const handleSend = () => {
    const lines = [
      `姓名：${name}`,
      email.trim() ? `回覆 Email：${email}` : "",
      "",
      message,
    ].filter(Boolean);
    const mailSubject = encodeURIComponent(subject.trim() || `券問聯絡：${name}`);
    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${body}`;
  };

  return (
    <main className="min-h-screen bg-[var(--q-canvas)] text-[var(--q-body)]">
      <MarketingNav />

      <section className="mx-auto max-w-2xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--q-muted)]">Contact</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.02em] text-[var(--q-ink)] sm:text-5xl">聯絡我們</h1>
        <p className="mt-4 text-base text-[var(--q-muted)]">
          有任何問題、合作提案或意見回饋？填寫下方表單，我們會盡快回覆。
        </p>

        <div className="mt-8 space-y-4 rounded-xl border border-[var(--q-hairline)] bg-[var(--q-surface-card)] p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--q-ink)]">姓名 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[var(--q-hairline)] bg-[var(--q-canvas)] px-3 py-2 text-sm"
              placeholder="您的稱呼"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--q-ink)]">回覆 Email（選填）</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[var(--q-hairline)] bg-[var(--q-canvas)] px-3 py-2 text-sm"
              placeholder="方便我們回覆您的信箱"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--q-ink)]">主題（選填）</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-[var(--q-hairline)] bg-[var(--q-canvas)] px-3 py-2 text-sm"
              placeholder="例：問卷合作 / 帳號問題 / 意見回饋"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--q-ink)]">訊息 *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-[var(--q-hairline)] bg-[var(--q-canvas)] px-3 py-2 text-sm"
              placeholder="請描述您的問題或需求"
            />
          </div>
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className="inline-flex min-h-[44px] items-center rounded-md bg-[var(--q-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--q-on-primary)] transition hover:bg-[var(--q-primary-active)] disabled:opacity-50"
          >
            送出
          </button>
          <p className="text-xs text-[var(--q-muted)]">
            送出會開啟您的郵件程式並帶入內容寄給客服團隊；若無法開啟，請改用您慣用的信箱來信。
          </p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
