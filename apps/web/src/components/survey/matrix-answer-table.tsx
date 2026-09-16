'use client';

import {
  matrixConfigParts,
  parseMatrixAnswer,
  type MatrixValue,
} from '@/lib/matrix-answer';

type Props = {
  config?: Record<string, unknown> | null;
  /** Stored JSON string (unlocked / export) OR live UI value. */
  textAnswer?: string | null;
  value?: MatrixValue;
  onChange?: (next: MatrixValue) => void;
  /** When true, radios/checkboxes are interactive. */
  editable?: boolean;
  namePrefix?: string;
};

/**
 * Shared matrix table for mutual fill + unlocked answer display.
 * Matches SurveyJS row/column label model (single or multi).
 */
export function MatrixAnswerTable({
  config,
  textAnswer,
  value: valueProp,
  onChange,
  editable = false,
  namePrefix = 'matrix',
}: Props) {
  const { rows, columns, multiple } = matrixConfigParts(config);
  const value =
    valueProp ??
    parseMatrixAnswer(textAnswer, multiple);

  if (rows.length === 0 || columns.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">（矩陣題設定不完整）</p>
    );
  }

  const setCell = (row: string, col: string) => {
    if (!editable || !onChange) return;
    if (multiple) {
      const prev = Array.isArray(value[row]) ? (value[row] as string[]) : [];
      const next = prev.includes(col) ? prev.filter((x) => x !== col) : [...prev, col];
      onChange({ ...value, [row]: next });
    } else {
      onChange({ ...value, [row]: col });
    }
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">陳述</th>
            {columns.map((col) => (
              <th key={col} className="px-2 py-1.5 text-center font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row} className="border-t border-border">
              <td className="px-2 py-1.5 text-sm text-foreground">{row}</td>
              {columns.map((col) => {
                const selected = value[row];
                const checked = multiple
                  ? Array.isArray(selected) && selected.includes(col)
                  : selected === col;
                return (
                  <td key={col} className="px-2 py-1.5 text-center">
                    {editable ? (
                      <input
                        type={multiple ? 'checkbox' : 'radio'}
                        name={`${namePrefix}-${ri}`}
                        checked={!!checked}
                        onChange={() => setCell(row, col)}
                        aria-label={`${row}：${col}`}
                      />
                    ) : (
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs ${
                          checked
                            ? 'bg-primary/15 font-bold text-primary'
                            : 'text-muted-foreground/40'
                        }`}
                        aria-label={`${row}：${col}${checked ? '（已選）' : ''}`}
                      >
                        {checked ? (multiple ? '☑' : '●') : multiple ? '☐' : '○'}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
