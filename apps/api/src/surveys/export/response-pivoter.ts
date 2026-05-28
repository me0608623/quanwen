/**
 * 長表 → 寬表 pivot（SSOT: 問卷資料儲存與規模化設計.md §5.1、ADR-009-D3）。
 * 後端程式 pivot（非 SQL crosstab、非每卷 MV）。純函式，四格式共用。
 * 題型用「type → handler」策略表；新增題型只加 handler，不改主流程。
 */

export interface PivotQuestion {
  id: string;
  type: string;
  title: string;
}

export interface PivotAnswer {
  questionId: string;
  textAnswer?: string | null;
  selectedOptionIds?: string[] | null;
  ratingValue?: number | null;
}

/** optionId → label（由 question_options 組）。 */
export type OptionLabelMap = Record<string, string>;

const MULTI_SEP = ' | ';

/** 把題目標題清成適合當欄名（去換行/逗號/引號）。 */
export function sanitizeHeader(title: string): string {
  return (title ?? '').replace(/[\r\n,"]+/g, ' ').trim().slice(0, 60);
}

/** 寬表的「題目欄」header：Q1_標題、Q2_標題…（meta 欄由呼叫端另外前置）。 */
export function questionHeaders(questions: PivotQuestion[]): string[] {
  return questions.map((q, i) => `Q${i + 1}_${sanitizeHeader(q.title)}`);
}

type CellHandler = (a: PivotAnswer | undefined, opts: OptionLabelMap) => string;

const optionLabels = (ids: string[] | null | undefined, opts: OptionLabelMap): string[] =>
  (ids ?? []).map((id) => opts[id] ?? id);

const HANDLERS: Record<string, CellHandler> = {
  single_choice: (a, opts) => optionLabels(a?.selectedOptionIds, opts)[0] ?? '',
  multiple_choice: (a, opts) => optionLabels(a?.selectedOptionIds, opts).join(MULTI_SEP),
  rating: (a) => (a?.ratingValue ?? '') === '' ? '' : String(a?.ratingValue),
  text: (a) => a?.textAnswer ?? '',
  matrix: (a) => a?.textAnswer ?? '', // MVP：原樣輸出 JSON string；子欄展開為 P1
};

/** 未知題型的保守 fallback：有什麼吐什麼。 */
const fallbackHandler: CellHandler = (a, opts) => {
  if (a?.textAnswer != null && a.textAnswer !== '') return a.textAnswer;
  if (a?.selectedOptionIds?.length) return optionLabels(a.selectedOptionIds, opts).join(MULTI_SEP);
  if (a?.ratingValue != null) return String(a.ratingValue);
  return '';
};

/** 單一題目的 cell（依題型格式化）。 */
export function pivotCell(
  question: PivotQuestion,
  answer: PivotAnswer | undefined,
  opts: OptionLabelMap,
): string {
  const handler = HANDLERS[question.type] ?? fallbackHandler;
  return handler(answer, opts);
}

/** 一份填答的「題目欄」cells（與 questionHeaders 對齊）。 */
export function pivotAnswerCells(
  questions: PivotQuestion[],
  answers: PivotAnswer[],
  opts: OptionLabelMap,
): string[] {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  return questions.map((q) => pivotCell(q, byQuestion.get(q.id), opts));
}
