"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

// ── Stage 1: Survey card mock ────────────────────────────────────────────────

function SurveyCardVisual() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[var(--q-hairline)] bg-[var(--q-canvas)] p-5 shadow-[0_8px_28px_rgba(55,47,35,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.08em] text-[var(--q-muted)] uppercase">
            問卷標題
          </p>
          <h4 className="mt-1 truncate text-base font-semibold text-[var(--q-ink)]">
            消費者行為調查
          </h4>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--q-primary)]/12 px-2.5 py-1 text-[10px] font-semibold text-[var(--q-primary-active)]">
          發布中
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["25-34 歲", "台北市", "上班族", "有消費意識"].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[var(--q-hairline)] bg-[var(--q-surface-soft)] px-2 py-0.5 text-[10px] text-[var(--q-body)]"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--q-hairline)] pt-4">
        <div>
          <p className="text-[10px] text-[var(--q-muted)]">目標樣本</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--q-ink)]">100 份</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--q-muted)]">每份獎勵</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--q-ink)]">NT$ 30</p>
        </div>
      </div>
    </div>
  );
}

// ── Stage 2: Audience matching visual ───────────────────────────────────────

function AudienceMatchVisual() {
  const profiles = ["林", "陳", "王", "張"];

  return (
    <div className="overflow-hidden rounded-[1.5rem] bg-[var(--q-surface-dark)] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/8 text-xs font-semibold text-[var(--q-on-dark)]">
          問卷
        </div>
        <div className="relative flex-1 py-3">
          <div className="h-px w-full bg-white/10" />
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-0 my-auto h-px bg-gradient-to-r from-[var(--q-primary)] to-[var(--q-accent-teal)]"
            initial={{ width: "0%" }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: "easeInOut", delay: 0.4 }}
          />
        </div>
        <div className="flex flex-col gap-2">
          {profiles.map((initial, i) => (
            <motion.div
              key={initial}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--q-on-dark)]"
              initial={{ opacity: 0, x: 10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.5 + i * 0.09 }}
            >
              {initial}
            </motion.div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[11px] text-[var(--q-on-dark-soft)]">
        4 位符合條件的填答者已媒合
      </p>
    </div>
  );
}

// ── Stage 3: Quality score meter ─────────────────────────────────────────────

function QualityScoreMeterVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-[1.5rem] border border-[var(--q-hairline)] bg-[var(--q-canvas)] p-5 shadow-[0_8px_28px_rgba(55,47,35,0.07)]"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--q-muted)]">品質分數</span>
        <span className="font-semibold tabular-nums text-[var(--q-ink)]">78 / 100</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--q-surface-cream-strong)]">
        <motion.div
          className="h-full rounded-full bg-[var(--q-primary)]"
          initial={{ width: "0%" }}
          animate={isInView ? { width: "78%" } : { width: "0%" }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["行為偵測", "邏輯檢核", "AI 裁決"].map((check) => (
          <div key={check} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--q-success)]" />
            <span className="text-[10px] text-[var(--q-body)]">{check}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-[var(--q-success)]/10 py-2 text-center">
        <span className="text-xs font-semibold text-[var(--q-success)]">通過審核</span>
      </div>
    </div>
  );
}

// ── Stage 4: Reward wallet visual ────────────────────────────────────────────

function RewardWalletVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <div ref={ref} className="overflow-hidden rounded-[1.5rem] bg-[var(--q-surface-dark)] p-5">
      <p className="text-[10px] font-medium tracking-[0.08em] text-[var(--q-on-dark-soft)] uppercase">
        我的收益
      </p>
      <motion.p
        className="mt-2 text-3xl font-bold tracking-tight text-[var(--q-on-dark)]"
        initial={{ opacity: 0, scale: 0.88 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        NT$ 2,860
      </motion.p>
      <div className="mt-4 space-y-2.5">
        {[
          { label: "現金回饋", value: "NT$ 1,200" },
          { label: "7-11 禮券", value: "2 張" },
          { label: "積分", value: "1,660 pts" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            className="flex items-center justify-between"
            initial={{ opacity: 0, x: -6 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.35, delay: 0.45 + i * 0.09 }}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--q-accent-teal)]" />
              <span className="text-[11px] text-[var(--q-on-dark-soft)]">{item.label}</span>
            </div>
            <span className="text-[11px] font-semibold text-[var(--q-on-dark)]">{item.value}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-[var(--q-accent-teal)]">入帳成功 · 綠界託管中</p>
    </div>
  );
}

// ── Stage data ────────────────────────────────────────────────────────────────

const stages = [
  {
    id: "survey",
    number: "01",
    tag: "發問卷",
    headline: "設定受眾條件，問卷上線",
    body: "設定年齡、地區、職業等篩選條件，系統把問卷推給最符合需求的填答者，不用手動廣告投放。",
    Visual: SurveyCardVisual,
    darkVisual: false,
  },
  {
    id: "match",
    number: "02",
    tag: "找對象",
    headline: "精準媒合，不浪費每一份",
    body: "受眾節點在後台被篩選與連線，每份回覆都來自真正符合條件的人，不靠亂槍打鳥。",
    Visual: AudienceMatchVisual,
    darkVisual: true,
  },
  {
    id: "audit",
    number: "03",
    tag: "過審核",
    headline: "三層把關，擋掉灌水樣本",
    body: "行為偵測、邏輯檢核與 AI 語義分析三道審核，分數低於標準的回覆自動排除，不進樣本集。",
    Visual: QualityScoreMeterVisual,
    darkVisual: false,
  },
  {
    id: "reward",
    number: "04",
    tag: "拿獎賞",
    headline: "通過審核，獎勵自動入帳",
    body: "現金、超商禮券與積分集中在同一個面板，每筆交易透明可追蹤，零人工操作。",
    Visual: RewardWalletVisual,
    darkVisual: true,
  },
] as const;

// ── Stage card ────────────────────────────────────────────────────────────────

interface StageCardProps {
  stage: (typeof stages)[number];
  index: number;
  reduce: boolean;
}

function StageCard({ stage, index, reduce }: StageCardProps) {
  const { Visual, darkVisual } = stage;
  const flip = index % 2 !== 0;

  return (
    <motion.article
      className="grid overflow-hidden rounded-[2rem] border border-[var(--q-hairline)] bg-[var(--q-canvas)] shadow-[0_14px_48px_rgba(55,47,35,0.06)] lg:grid-cols-2"
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
    >
      {/* Text side */}
      <div
        className={`flex flex-col justify-center p-7 sm:p-9 ${flip ? "lg:order-2" : ""}`}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold tabular-nums text-[var(--q-muted-soft)]">
            {stage.number}
          </span>
          <span className="rounded-full bg-[var(--q-primary)]/12 px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-[var(--q-primary-active)]">
            {stage.tag}
          </span>
        </div>
        <h3 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.025em] text-[var(--q-ink)] sm:text-2xl">
          {stage.headline}
        </h3>
        <p className="mt-3 max-w-xs text-sm leading-7 text-[var(--q-body)]">
          {stage.body}
        </p>
      </div>

      {/* Visual side */}
      <div
        className={`flex items-center justify-center border-t border-[var(--q-hairline)] p-7 sm:p-9 lg:border-l lg:border-t-0 ${flip ? "lg:order-1" : ""} ${
          darkVisual
            ? "bg-[var(--q-surface-dark-soft)]"
            : "bg-[var(--q-surface-soft)]"
        }`}
      >
        <div className="w-full max-w-sm">
          <Visual />
        </div>
      </div>
    </motion.article>
  );
}

// ── Main section export ───────────────────────────────────────────────────────

export function ScrollStorySection() {
  const reduce = useReducedMotion() ?? false;

  return (
    <section id="how-it-works" className="q-home-section q-home-section-tinted">
      <div className="q-home-container">
        <div className="max-w-2xl">
          <h2 className="q-home-heading">
            四個步驟，完成一次有效問卷。
          </h2>
          <p className="q-home-lead mt-5">
            研究者發問卷、平台找對象、系統過審核、填答者拿獎賞。
            每個環節都自動化，不需要你追蹤進度。
          </p>
        </div>

        <div className="mt-12 space-y-5 sm:mt-14">
          {stages.map((stage, i) => (
            <StageCard key={stage.id} stage={stage} index={i} reduce={reduce} />
          ))}
        </div>
      </div>
    </section>
  );
}
