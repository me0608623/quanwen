"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

// ── Stats analysis visual ─────────────────────────────────────────────────────

const analysisChips = [
  "交叉分析",
  "Cronbach's α",
  "NPS",
  "相關性分析",
  "獨立 t 檢定",
  "單因子 ANOVA",
  "迴歸分析",
  "K-means 分群",
];

const reliabilityRows = [
  { label: "整體量表", value: 0.87 },
  { label: "子構面 A", value: 0.79 },
  { label: "子構面 B", value: 0.83 },
];

function StatsAnalysisVisual({ reduce }: { reduce: boolean }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        {analysisChips.map((chip, i) => (
          <motion.span
            key={chip}
            className="rounded-full border border-[var(--q-hairline)] bg-[var(--q-canvas)] px-3 py-1 text-[0.6875rem] font-medium text-[var(--q-body)]"
            initial={reduce ? false : { opacity: 0, y: 5 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.35,
              delay: 0.08 + i * 0.045,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {chip}
          </motion.span>
        ))}
      </div>

      <div className="rounded-[1rem] border border-[var(--q-hairline)] bg-[var(--q-canvas)] p-4">
        <p className="text-[0.625rem] font-semibold tracking-[0.1em] text-[var(--q-muted)] uppercase">
          信度分析預覽
        </p>
        <div className="mt-3 space-y-2.5">
          {reliabilityRows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[11px] text-[var(--q-muted)]">
                {row.label}
              </span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--q-surface-cream-strong)]">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--q-primary)]"
                  initial={{ width: "0%" }}
                  whileInView={{ width: `${row.value * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                />
              </div>
              <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-[var(--q-ink)]">
                {row.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-[var(--q-muted)]">
          Cronbach&apos;s alpha 0.7 以上代表良好內部一致性信度
        </p>
      </div>
    </div>
  );
}

// ── AI report visual ──────────────────────────────────────────────────────────

const aiReportLines = [
  "整體滿意度偏高，均值 4.2 分（5 分制）。",
  "25-34 歲族群 NPS 達 +62，顯著高於其他年齡段。",
  "性別差異未達統計顯著水準（p = 0.31）。",
];

function AiReportVisual({ reduce }: { reduce: boolean }) {
  return (
    <div className="mt-5 overflow-hidden rounded-[1rem] border border-white/[0.08] bg-white/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--q-accent-teal)]" />
        <span className="text-[10px] font-medium text-[var(--q-accent-teal)]">
          AI 解讀完成
        </span>
      </div>
      <div className="space-y-2">
        {aiReportLines.map((line, i) => (
          <motion.p
            key={i}
            className="text-[11px] leading-[1.65] text-[var(--q-on-dark-soft)]"
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 + i * 0.12 }}
          >
            {line}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

// ── Points visual ─────────────────────────────────────────────────────────────

function PointsVisual({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <div ref={ref} className="mt-5">
      <div className="flex items-end gap-1.5">
        <motion.span
          className="font-mono text-3xl font-bold tracking-tight text-[var(--q-ink)]"
          initial={reduce ? false : { opacity: 0, scale: 0.88 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          1,660
        </motion.span>
        <span className="mb-1 text-xs font-medium text-[var(--q-muted)]">pts</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <span className="rounded-[0.75rem] bg-[var(--q-surface-soft)] px-3 py-1.5 text-center text-[10px] font-medium text-[var(--q-body)]">
          填問卷累積
        </span>
        <span className="rounded-[0.75rem] bg-[var(--q-primary)]/10 px-3 py-1.5 text-center text-[10px] font-semibold text-[var(--q-primary-active)]">
          折抵 AI 分析次數
        </span>
      </div>
    </div>
  );
}

// ── Export format visual ──────────────────────────────────────────────────────

const exportFormats = [
  { label: "JASP 格式", ext: ".jasp", bg: "bg-[var(--q-accent-teal)]" },
  { label: "SPSS 格式", ext: ".sav", bg: "bg-[var(--q-accent-amber)]" },
];

function ExportFormatVisual() {
  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {exportFormats.map((fmt) => (
        <div
          key={fmt.label}
          className="flex items-center gap-3 rounded-[0.875rem] border border-[var(--q-hairline)] bg-[var(--q-canvas)] px-3.5 py-2.5"
        >
          <span
            className={`flex h-7 w-10 shrink-0 items-center justify-center rounded-lg text-[0.55rem] font-bold tracking-[0.06em] text-white ${fmt.bg}`}
            aria-hidden="true"
          >
            {fmt.ext}
          </span>
          <div>
            <p className="text-xs font-semibold text-[var(--q-ink)]">{fmt.label}</p>
            <p className="text-[10px] text-[var(--q-muted)]">含變數 codebook</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main section export ───────────────────────────────────────────────────────

const enterVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const, delay },
  }),
};

export function AnalyticsFeaturesSection() {
  const reduce = useReducedMotion() ?? false;

  return (
    <section id="analytics" aria-labelledby="analytics-heading" className="q-home-section">
      <div className="q-home-container">
        {/* Section header */}
        <div className="max-w-3xl">
          <p className="q-home-kicker">分析與輸出</p>
          <h2
            id="analytics-heading"
            className="q-home-heading mt-4"
          >
            收完資料，下一步平台都備好了。
          </h2>
          <p className="q-home-lead mt-5">
            從統計分析到 AI 解讀，再到學術格式匯出，不需要另開軟體，不懂統計也能讀懂報告。
          </p>
        </div>

        {/* Bento grid */}
        <div className="mt-8 grid gap-3.5 sm:mt-12 sm:gap-4 lg:grid-cols-[1.3fr_0.7fr]">

          {/* LEFT: Statistics analysis — large feature card */}
          <motion.article
            className="q-home-card-feature"
            variants={reduce ? {} : enterVariants}
            initial="hidden"
            whileInView="visible"
            custom={0}
            viewport={{ once: true, amount: 0.15 }}
            aria-label="問卷統計學分析功能介紹"
          >
            <p className="q-card-label">Statistical Analysis</p>
            <h3 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.025em] text-[var(--q-ink)] sm:text-2xl">
              不只是平均值。交叉分析、信度、ANOVA，一次跑完。
            </h3>
            <p className="mt-3 text-sm leading-7 text-[var(--q-body)]">
              從基礎描述統計到 t 檢定、迴歸分析與分群，問卷收完後平台自動計算。不需要手動匯出到 Excel 或另開統計軟體。
            </p>
            <StatsAnalysisVisual reduce={reduce} />
          </motion.article>

          {/* RIGHT: stacked column */}
          <div className="flex flex-col gap-3.5 sm:gap-4">

            {/* AI summary report — dark card */}
            <motion.article
              className="overflow-hidden rounded-[1.45rem] bg-[var(--q-surface-dark)] p-5 shadow-[0_18px_60px_rgba(24,23,21,0.18)] sm:rounded-[1.75rem] sm:p-7"
              variants={reduce ? {} : enterVariants}
              initial="hidden"
              whileInView="visible"
              custom={0.1}
              viewport={{ once: true, amount: 0.15 }}
              aria-label="AI 摘要報告功能介紹"
            >
              <p className="font-mono text-xs font-semibold tracking-[0.12em] text-[var(--q-accent-teal)]">
                AI Summary
              </p>
              <h3 className="mt-4 text-lg font-semibold leading-tight tracking-[-0.025em] text-[var(--q-on-dark)] sm:text-xl">
                數字背後說了什麼，AI 用白話寫出來。
              </h3>
              <p className="mt-3 text-sm leading-7 text-[var(--q-on-dark-soft)]">
                統計跑完後自動產出文字摘要，關鍵發現、顯著差異與建議方向一起整理，不懂統計術語也能直接讀懂。
              </p>
              <AiReportVisual reduce={reduce} />
            </motion.article>

            {/* Bottom pair: points + export */}
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4">

              {/* Points system */}
              <motion.article
                className="q-abuse-card"
                variants={reduce ? {} : enterVariants}
                initial="hidden"
                whileInView="visible"
                custom={0.18}
                viewport={{ once: true, amount: 0.2 }}
                aria-label="積分制度功能介紹"
              >
                <h3 className="text-sm font-semibold leading-tight tracking-[-0.015em] text-[var(--q-ink)]">
                  積分制度
                </h3>
                <p className="mt-2 text-xs leading-6 text-[var(--q-body)]">
                  填問卷累積積分。免費 AI 次數用完後，以積分折抵繼續做分析。
                </p>
                <PointsVisual reduce={reduce} />
              </motion.article>

              {/* JASP / SPSS export */}
              <motion.article
                className="q-abuse-card"
                variants={reduce ? {} : enterVariants}
                initial="hidden"
                whileInView="visible"
                custom={0.23}
                viewport={{ once: true, amount: 0.2 }}
                aria-label="JASP SPSS 格式匯出功能介紹"
              >
                <h3 className="text-sm font-semibold leading-tight tracking-[-0.015em] text-[var(--q-ink)]">
                  學術格式匯出
                </h3>
                <p className="mt-2 text-xs leading-6 text-[var(--q-body)]">
                  一鍵輸出 JASP 與 SPSS 可直接匯入的格式，含變數 codebook。
                </p>
                <ExportFormatVisual />
              </motion.article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
