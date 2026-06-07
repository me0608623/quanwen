/**
 * 問卷定價 — 題型費率設定（SSOT: 13-系統深度設計/問卷定價與AI獎勵顧問設計.md §4）
 *
 * 所有金額以「分(cent)」運算避免浮點；只在最後換算成整數元。
 * 這些數值刻意集中在此檔，方便依真實完成數據校準（不寫死在邏輯裡）。
 */

/** 基準時薪（新台幣元）。對齊台灣 2026 基本工資時薪 NT$196；調整基本工資時更新此值。 */
export const BASE_HOURLY_WAGE_NT = 196;

/** 每分鐘建議基準費率（單位：分）。由基準時薪換算（196/60 ≈ NT$3.27/分）。僅用於「建議」，無強制力。 */
export const REWARD_RATE_PER_MIN_CENTS = Math.round((BASE_HOURLY_WAGE_NT * 100) / 60);

/**
 * 每份填答的固定開銷秒數：點進問卷、閱讀說明、檢查與送出的固定成本，
 * 與題數無關。沒有這項時 1-2 題的迷你問卷會估出 NT$1 的不合理建議價。
 */
export const FIXED_OVERHEAD_SECONDS = 60;

/** 各題型預估作答秒數。key 對齊 schema.sql 的 question_type enum（含 DTO 目前的別名）。 */
export const QUESTION_BASE_SECONDS: Record<string, number> = {
  single_choice: 6,
  multi_choice: 12,
  multiple_choice: 12, // DTO 別名（schema 為 multi_choice）
  likert: 8,
  nps: 6,
  rating: 7,
  date: 8,
  text: 45, // DTO 的開放題（簡答）
  open_short: 45,
  open_long: 120,
  file_upload: 90,
  // rank / matrix 為動態，見下方常數
};

/** 未知題型的保守預設秒數。 */
export const DEFAULT_QUESTION_SECONDS = 30;

/** 排序題：每個選項的逐項比較秒數。 */
export const RANK_SECONDS_PER_ITEM = 5;

/** 矩陣題：每一列（視為一個量表）的秒數。 */
export const MATRIX_SECONDS_PER_ROW = 6;

/** 開放題達「最低字數要求」時的寫作負擔倍率。 */
export const OPEN_TEXT_LENGTH_MULTIPLIER = 1.5;

/** 觸發長度倍率的最低字數門檻。 */
export const OPEN_TEXT_MIN_LENGTH_THRESHOLD = 50;

/** 選填題（isRequired=false）以半權重計（可能被跳過）。 */
export const OPTIONAL_QUESTION_WEIGHT = 0.5;

/** 前言/說明閱讀速度（中文約 5 字/秒）。 */
export const READING_CHARS_PER_SEC = 5;

/** 建議區間相對「公平價」的倍率（MVP 啟發式）。 */
export const SUGGESTION_RANGE = {
  economical: 0.8,
  fair: 1.0,
  fast: 1.3,
} as const;

/**
 * 計價單位（已定案 2026-05-26）：獎勵以「點數」計價，**1 點 = NT$1**。
 * rubric 以新台幣元估算，1:1 對應到 surveys.rewardPoints；不需轉換。
 */
export const POINTS_PER_NT_DOLLAR = 1;

/**
 * screen-out（篩選題被篩掉者）補償 — B 方案，排入 v1.1。
 * 被篩掉者給小額善意「積分」（非現金），降低在篩選題說謊以求過關的誘因。
 * 需先有「篩選題/資格判定」功能才會啟用；金額待 v1.1 用真實數據校準。
 */
export const SCREEN_OUT_COMP_POINTS = 1;
