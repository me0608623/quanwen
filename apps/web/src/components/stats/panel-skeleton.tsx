'use client';

/**
 * Unified skeleton loading components for the stats page.
 * All panels use the same visual pattern: animate-pulse bg-muted rows.
 * Heights are calibrated to match actual content (< 20px error).
 */

/** Skeleton rows rendered *inside* an existing section wrapper. */
export function PanelSkeletonContent({ rows = 3 }: { rows?: number }) {
  const widths = ['80%', '65%', '50%', '70%', '55%'];
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-muted"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

/**
 * Full panel skeleton — drop-in replacement for a `<section>` while loading.
 * `minHeight` should match the real panel's approximate rendered height.
 */
export function StatsPanelSkeleton({
  minHeight = 160,
  label,
}: {
  minHeight?: number;
  label?: string;
}) {
  return (
    <section
      className="rounded-lg border border-border p-5"
      aria-busy="true"
      aria-label={label ? `${label} 載入中` : '載入中'}
      style={{ minHeight }}
    >
      {/* Header row */}
      <div className="mb-4 h-3 w-32 animate-pulse rounded bg-muted" />
      {/* Content rows */}
      <PanelSkeletonContent rows={3} />
      {/* Chart placeholder */}
      {minHeight > 120 && (
        <div className="mt-4 h-16 animate-pulse rounded bg-muted/60" />
      )}
    </section>
  );
}

/**
 * Full-page skeleton shown while the primary stats query is in-flight.
 * Mirrors the real page layout so content appears in-place without CLS.
 */
export function StatsPageSkeleton() {
  return (
    <main
      className="mx-auto max-w-6xl space-y-6 pb-12"
      aria-busy="true"
      aria-label="統計頁載入中"
    >
      {/* Header gradient — matches real rounded-3xl gradient header */}
      <div className="h-[248px] animate-pulse rounded-3xl bg-gradient-to-br from-[#0F2A5C]/20 via-[#126b8a]/15 to-[#8B5CF6]/15" />

      {/* Toolbar */}
      <div className="h-[76px] animate-pulse rounded-2xl bg-muted" />

      {/* Nav strip */}
      <div className="h-12 animate-pulse rounded-xl bg-muted" />

      {/* AI 洞察 panel */}
      <StatsPanelSkeleton minHeight={320} label="AI 洞察簡報" />

      {/* 趨勢圖 panel */}
      <StatsPanelSkeleton minHeight={172} label="近 14 天填答趨勢" />

      {/* 進階量化 section — banner + several panels stacked */}
      <div className="space-y-6">
        <div className="h-[72px] animate-pulse rounded-xl bg-muted" />
        <StatsPanelSkeleton minHeight={200} label="交叉分析" />
        <StatsPanelSkeleton minHeight={160} label="量表信度" />
        <StatsPanelSkeleton minHeight={180} label="NPS 淨推薦值" />
      </div>

      {/* 受訪者清單 */}
      <StatsPanelSkeleton minHeight={232} label="受訪者清單" />

      {/* 逐題圖表 — show two question placeholders */}
      <div className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <StatsPanelSkeleton minHeight={180} label="題目 1" />
        <StatsPanelSkeleton minHeight={180} label="題目 2" />
      </div>
    </main>
  );
}
