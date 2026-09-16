/** Matrix answer helpers — stored as JSON in responseAnswers.textAnswer. */

export type MatrixConfigParts = {
  rows: string[];
  columns: string[];
  multiple: boolean;
};

/** UI-friendly: row label → column label (single) or column labels (multi). */
export type MatrixValue = Record<string, string | string[]>;

export function matrixConfigParts(
  config?: Record<string, unknown> | null,
): MatrixConfigParts {
  const matrix = (config?.matrix ?? {}) as {
    rows?: string[];
    columns?: string[];
    multiple?: boolean;
  };
  return {
    rows: Array.isArray(matrix.rows) ? matrix.rows.filter(Boolean) : [],
    columns: Array.isArray(matrix.columns) ? matrix.columns.filter(Boolean) : [],
    multiple: matrix.multiple === true,
  };
}

/**
 * Parse stored textAnswer JSON into row → selected column(s).
 * Supports single-select `{ row: "col" }` and SurveyJS multi `{ row: { col: true } }`
 * as well as array form `{ row: ["col"] }`.
 */
export function parseMatrixAnswer(
  textAnswer: string | null | undefined,
  multiple = false,
): MatrixValue {
  if (!textAnswer?.trim()) return {};
  try {
    const raw = JSON.parse(textAnswer) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: MatrixValue = {};
    for (const [row, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === 'string') {
        out[row] = multiple ? [val] : val;
      } else if (Array.isArray(val)) {
        const cols = val.filter((x): x is string => typeof x === 'string');
        out[row] = multiple ? cols : (cols[0] ?? '');
      } else if (val && typeof val === 'object') {
        const cols = Object.entries(val as Record<string, unknown>)
          .filter(([, v]) => v === true || v === 'true' || v === 1)
          .map(([k]) => k);
        out[row] = multiple ? cols : (cols[0] ?? '');
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Serialize UI value to the same JSON shape SurveyJS / extractAnswers produce. */
export function serializeMatrixAnswer(value: MatrixValue, multiple: boolean): string {
  if (multiple) {
    const obj: Record<string, Record<string, boolean>> = {};
    for (const [row, cols] of Object.entries(value)) {
      const list = Array.isArray(cols) ? cols : cols ? [cols] : [];
      if (list.length === 0) continue;
      obj[row] = Object.fromEntries(list.map((c) => [c, true]));
    }
    return JSON.stringify(obj);
  }
  const obj: Record<string, string> = {};
  for (const [row, col] of Object.entries(value)) {
    if (typeof col === 'string' && col) obj[row] = col;
  }
  return JSON.stringify(obj);
}

export function isMatrixAnswerComplete(
  value: MatrixValue,
  rows: string[],
  multiple: boolean,
): boolean {
  if (rows.length === 0) return true;
  return rows.every((row) => {
    const v = value[row];
    if (multiple) return Array.isArray(v) && v.length > 0;
    return typeof v === 'string' && v.length > 0;
  });
}

/** Labels shown for a single row selection (empty → —). */
export function matrixRowSelectionLabel(
  value: MatrixValue,
  row: string,
): string {
  const v = value[row];
  if (Array.isArray(v)) return v.length > 0 ? v.join('、') : '—';
  if (typeof v === 'string' && v) return v;
  return '—';
}
