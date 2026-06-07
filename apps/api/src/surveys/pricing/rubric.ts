/**
 * 決定性題型費率查表（Layer 1）— SSOT: 13-系統深度設計/問卷定價與AI獎勵顧問設計.md §4
 *
 * 純函式、無副作用、不需 AI / DB，方便單元測試與前端共用語意。
 * 輸出「建議基準價」(整數新台幣元)；發問卷者完全自訂，這只是參考。
 */
import {
  REWARD_RATE_PER_MIN_CENTS,
  FIXED_OVERHEAD_SECONDS,
  QUESTION_BASE_SECONDS,
  DEFAULT_QUESTION_SECONDS,
  RANK_SECONDS_PER_ITEM,
  MATRIX_SECONDS_PER_ROW,
  OPEN_TEXT_LENGTH_MULTIPLIER,
  OPEN_TEXT_MIN_LENGTH_THRESHOLD,
  OPTIONAL_QUESTION_WEIGHT,
  READING_CHARS_PER_SEC,
} from './pricing.config';

/** rubric 估價用的最小題目描述（與 create-survey DTO 鬆耦合）。 */
export interface RubricQuestion {
  type: string;
  isRequired?: boolean;
  options?: { label?: string }[];
  /** 題型細節：matrix 列數 / 開放題最低字數 / 內嵌影片秒數。 */
  config?: {
    rows?: number;
    minLength?: number;
    mediaWatchSec?: number;
    [k: string]: unknown;
  };
}

export interface QuestionEstimate {
  type: string;
  /** 套用選填權重後的秒數。 */
  seconds: number;
}

export interface RubricResult {
  totalSeconds: number;
  /** 建議基準價（整數新台幣元）。 */
  baseRewardNt: number;
  perQuestion: QuestionEstimate[];
}

export interface RubricOptions {
  /** 前言/說明字數（估閱讀時間併入）。 */
  introChars?: number;
}

const toInt = (n: number): number => (Number.isFinite(n) ? n : 0);

/** 估算單一題目的作答秒數（含內容修正與選填權重）。 */
export function estimateQuestionSeconds(q: RubricQuestion): number {
  const type = q.type;
  const cfg = q.config ?? {};
  let seconds: number;

  if (type === 'matrix') {
    const rows = toInt(cfg.rows ?? q.options?.length ?? 4);
    seconds = MATRIX_SECONDS_PER_ROW * Math.max(1, rows);
  } else if (type === 'rank') {
    const items = toInt(q.options?.length ?? cfg.rows ?? 4);
    seconds = RANK_SECONDS_PER_ITEM * Math.max(1, items);
  } else {
    seconds = QUESTION_BASE_SECONDS[type] ?? DEFAULT_QUESTION_SECONDS;
  }

  // 開放題：達最低字數要求 → 寫作負擔倍率
  const isOpen = type === 'text' || type === 'open_short' || type === 'open_long';
  if (isOpen) {
    const minLength = toInt(cfg.minLength ?? 0);
    if (minLength >= OPEN_TEXT_MIN_LENGTH_THRESHOLD) {
      seconds *= OPEN_TEXT_LENGTH_MULTIPLIER;
    }
  }

  // 內嵌影片：全額計入觀看時間（觀看是工作）
  const mediaWatchSec = toInt(cfg.mediaWatchSec ?? 0);
  if (mediaWatchSec > 0) {
    seconds += mediaWatchSec;
  }

  // 選填題以半權重計
  if (q.isRequired === false) {
    seconds *= OPTIONAL_QUESTION_WEIGHT;
  }

  return seconds;
}

/**
 * 估算整份問卷的建議基準價。
 * 內部以分(cent)運算避免浮點，最後無條件進位到整數元。
 */
export function estimateRubricBase(
  questions: RubricQuestion[],
  opts: RubricOptions = {},
): RubricResult {
  const perQuestion: QuestionEstimate[] = (questions ?? []).map((q) => ({
    type: q.type,
    seconds: estimateQuestionSeconds(q),
  }));

  const introSeconds =
    opts.introChars && opts.introChars > 0
      ? opts.introChars / READING_CHARS_PER_SEC
      : 0;

  const answerSeconds =
    perQuestion.reduce((sum, e) => sum + e.seconds, 0) + introSeconds;
  // 有題目才計固定開銷（空問卷估 0 元）
  const totalSeconds =
    answerSeconds > 0 ? answerSeconds + FIXED_OVERHEAD_SECONDS : 0;

  const cents = Math.round((totalSeconds / 60) * REWARD_RATE_PER_MIN_CENTS);
  const baseRewardNt = Math.ceil(cents / 100);

  return { totalSeconds, baseRewardNt, perQuestion };
}
