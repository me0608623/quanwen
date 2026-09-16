/**
 * Client-side survey completeness checks for create/edit/publish.
 * Messages are Traditional Chinese for surveyor-facing UX.
 */

export type SurveyQuestionLike = {
  type: string;
  title: string;
  options?: Array<{ label: string }>;
  config?: Record<string, unknown> | null;
};

export type CompletenessIssue = {
  path: string;
  message: string;
  questionIndex?: number;
};

function matrixParts(config?: Record<string, unknown> | null): { rows: string[]; columns: string[] } {
  const matrix = (config?.matrix ?? {}) as { rows?: string[]; columns?: string[] };
  return {
    rows: Array.isArray(matrix.rows) ? matrix.rows : [],
    columns: Array.isArray(matrix.columns) ? matrix.columns : [],
  };
}

/** Validate questions for save (aligns with API Zod: title/option labels non-empty). */
export function validateSurveyQuestions(questions: SurveyQuestionLike[]): CompletenessIssue[] {
  const issues: CompletenessIssue[] = [];

  questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.title.trim()) {
      issues.push({
        path: `questions.${i}.title`,
        message: `第 ${n} 題尚未填寫題目標題`,
        questionIndex: i,
      });
    }

    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      const opts = q.options ?? [];
      if (opts.length < 2) {
        issues.push({
          path: `questions.${i}.options`,
          message: `第 ${n} 題（選擇題）至少需要 2 個選項`,
          questionIndex: i,
        });
      }
      opts.forEach((o, oi) => {
        if (!o.label.trim()) {
          issues.push({
            path: `questions.${i}.options.${oi}`,
            message: `第 ${n} 題的選項 ${oi + 1} 尚未填寫文字`,
            questionIndex: i,
          });
        }
      });
    }

    if (q.type === 'matrix') {
      const { rows, columns } = matrixParts(q.config);
      const filledRows = rows.filter((r) => r.trim());
      const filledCols = columns.filter((c) => c.trim());
      if (filledRows.length < 1) {
        issues.push({
          path: `questions.${i}.matrix.rows`,
          message: `第 ${n} 題（矩陣）至少需要 1 個陳述／子題`,
          questionIndex: i,
        });
      }
      if (filledCols.length < 2) {
        issues.push({
          path: `questions.${i}.matrix.columns`,
          message: `第 ${n} 題（矩陣）至少需要 2 個量表選項`,
          questionIndex: i,
        });
      }
      rows.forEach((r, ri) => {
        if (!r.trim()) {
          issues.push({
            path: `questions.${i}.matrix.rows.${ri}`,
            message: `第 ${n} 題的陳述 ${ri + 1} 尚未填寫`,
            questionIndex: i,
          });
        }
      });
      columns.forEach((c, ci) => {
        if (!c.trim()) {
          issues.push({
            path: `questions.${i}.matrix.columns.${ci}`,
            message: `第 ${n} 題的量表選項 ${ci + 1} 尚未填寫`,
            questionIndex: i,
          });
        }
      });
    }
  });

  return issues;
}

/** Extra checks before publish (title + at least one question unless external). */
export function validateSurveyForPublish(input: {
  title: string;
  questions: SurveyQuestionLike[];
  isExternal?: boolean;
}): CompletenessIssue[] {
  const issues: CompletenessIssue[] = [];

  if (!input.title.trim()) {
    issues.push({ path: 'title', message: '請填寫問卷標題後再發布' });
  }

  if (input.isExternal) return issues;

  if (input.questions.length === 0) {
    issues.push({ path: 'questions', message: '問卷至少需要一道題目才能發布' });
    return issues;
  }

  issues.push(...validateSurveyQuestions(input.questions));
  return issues;
}

export function firstCompletenessMessage(issues: CompletenessIssue[]): string | null {
  return issues[0]?.message ?? null;
}
