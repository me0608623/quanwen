'use client';

// 後台共用 UI 原語 —— 統一品牌 teal #126b8a 單一強調色、cockpit 密度、一致徽章/面板/骨架。
// 色彩規則（Color Consistency Lock）：
//   teal  = 品牌/AI/連結/前進(肯定)動作/啟用狀態
//   red   = 危險(拒絕/停權/標記無效)
//   green/amber/red 徽章 = 資料語意分類（狀態/風險），非裝飾
import { useState } from 'react';

export const ADMIN_ACCENT = '#126b8a';

// ── 頁首 ──────────────────────────────────────────────────────────────────
export function AdminPageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

// ── 一致徽章 ───────────────────────────────────────────────────────────────
type Tone = 'teal' | 'green' | 'amber' | 'red' | 'neutral';
const TONE_CLS: Record<Tone, string> = {
  teal: 'bg-[#126b8a]/10 text-[#0f5d78]',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  neutral: 'bg-muted text-muted-foreground',
};

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLS[tone]}`}>
      {children}
    </span>
  );
}

// 待處理筆數標籤（頁首右側）
export function CountBadge({ n, label }: { n: number; label: string }) {
  if (n <= 0) return null;
  return (
    <span className="rounded-full bg-[#126b8a]/10 px-3 py-1 text-sm font-semibold text-[#0f5d78]">
      {n} {label}
    </span>
  );
}

// ── 動作按鈕（統一三種）────────────────────────────────────────────────────
const BTN_BASE =
  'inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50';

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return <button {...rest} className={`${BTN_BASE} bg-[#126b8a] text-white hover:bg-[#0f5d78] ${className}`} />;
}

export function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return <button {...rest} className={`${BTN_BASE} border border-destructive text-destructive hover:bg-destructive/10 ${className}`} />;
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return <button {...rest} className={`${BTN_BASE} border border-[#126b8a]/30 text-[#126b8a] hover:bg-[#126b8a]/10 ${className}`} />;
}

// ── AI 面板（取代三頁重複的紫色漸層）──────────────────────────────────────
export function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4z" />
    </svg>
  );
}

export function AiToggleButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <GhostButton onClick={onClick} className="border-[#126b8a]/30 bg-[#126b8a]/5">
      <SparkleIcon size={13} />
      {open ? '收起' : label}
    </GhostButton>
  );
}

export function AiPanel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-lg border border-[#126b8a]/25 bg-[#126b8a]/[0.04] p-4">{children}</div>;
}

export function AiPanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#126b8a]">
      <SparkleIcon size={13} />
      {children}
    </p>
  );
}

export function AiSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <AiPanelLabel>{label}</AiPanelLabel>
      <div className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-2.5 animate-pulse rounded bg-[#126b8a]/15" style={{ width: `${100 - i * 10}%` }} />
        ))}
      </div>
    </div>
  );
}

export function AiError() {
  return <p className="text-xs text-destructive">AI 服務暫時無法使用，請以人工判斷為主</p>;
}

// AI 面板內的文字區塊（理由/建議）
export function AiPara({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-[#126b8a]/15 bg-background/60 p-3 text-sm leading-relaxed text-foreground">
      {children}
    </p>
  );
}

// AI 面板內的小標
export function AiSubLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

// 左色條列表（紅旗/問題/訊號）
export function FlagList({ items, tone = 'amber' }: { items: string[]; tone?: 'amber' | 'red' }) {
  const cls = tone === 'red' ? 'border-l-red-400 bg-red-50/50' : 'border-l-amber-400 bg-amber-50/50';
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className={`rounded-r border-l-2 ${cls} py-1 pl-2 text-xs text-foreground`}>
          {it}
        </li>
      ))}
    </ul>
  );
}

export function AiDisclaimer() {
  return <p className="text-right text-[10px] text-muted-foreground">此為 AI 諮詢意見，最終由人工判斷</p>;
}

// ── 狀態：載入骨架 / 空狀態 ────────────────────────────────────────────────
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="h-10 animate-pulse bg-muted/60" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse border-t border-border bg-muted/30" />
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</div>
  );
}

// ── 分頁 ──────────────────────────────────────────────────────────────────
export function Pagination({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <p className="text-muted-foreground tabular-nums">共 {total.toLocaleString()} 筆</p>
      <div className="flex items-center gap-3">
        <button onClick={onPrev} disabled={page <= 1} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50">
          上一頁
        </button>
        <span className="tabular-nums text-muted-foreground">{page} / {totalPages}</span>
        <button onClick={onNext} disabled={page >= totalPages} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50">
          下一頁
        </button>
      </div>
    </div>
  );
}

// ── 原因輸入對話框（統一 拒絕/停權 等需要理由的破壞性確認）────────────────
export function ReasonDialog({
  title,
  subtitle,
  warning,
  label,
  placeholder,
  minLen = 1,
  maxLen,
  confirmLabel,
  onConfirm,
  onCancel,
  isPending,
  error,
}: {
  title: string;
  subtitle?: string;
  warning?: string;
  label: string;
  placeholder?: string;
  minLen?: number;
  maxLen?: number;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
  error?: string | null;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const valid = trimmed.length >= minLen && (maxLen ? trimmed.length <= maxLen : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h3 className="mb-1 text-base font-semibold">{title}</h3>
        {subtitle && <p className="mb-4 truncate text-sm text-muted-foreground">{subtitle}</p>}
        {warning && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {warning}
          </div>
        )}
        <label className="mb-1 block text-sm font-medium">{label}</label>
        <textarea
          className="h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#126b8a]"
          placeholder={placeholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {maxLen && (
          <p className={`mt-1 text-xs ${valid || trimmed.length === 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
            {trimmed.length}/{maxLen}
          </p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            取消
          </button>
          <button
            onClick={() => onConfirm(trimmed)}
            disabled={!valid || isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
