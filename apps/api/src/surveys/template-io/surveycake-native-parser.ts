/**
 * SurveyCake 原生 s3/json 格式解析器。
 *
 * surveycake.com/s/{svid} 填答頁是 React SPA,HTML 殼內沒有問卷資料;
 * 題目定義放在靜態路徑 https://www.surveycake.com/s3/json/{svid}.json。
 * 本模組把該 JSON 的 subjects 對映為 QuanWen 題目格式。
 *
 * 題型對映:
 *   CHOICEONE / DROPDOWN                          → single_choice
 *   CHOICEMULTI / PICKFROM / ADVANCED_SELECTION_BASED → multiple_choice（SurveyCake 共用同一複選 renderer）
 *   TXTSHORT / TXTLONG                            → text
 *   NEST(+ 後續 NESTCHILD)                         → matrix(columns=NEST options, rows=NESTCHILD texts)
 *   NEST_MULTI                                     → matrix（複選矩陣降級為單選矩陣,收 warning）
 *   STATEMENT / QUOTE / DIVIDER                    → 非題目,跳過
 *   其他                                            → text(fallback,收 warning)
 */

interface NativeOption {
  text?: string | null;
  orders?: number;
  invisible?: number;
}

interface NativeSubject {
  type?: string;
  text?: string | null;
  orders?: number;
  required?: number | boolean;
  invisible?: number;
  options?: NativeOption[] | null;
}

export interface ParsedQuestion {
  type: 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';
  title: string;
  sortOrder: number;
  isRequired: boolean;
  config: Record<string, unknown>;
  options?: { label: string; sortOrder: number }[];
}

export interface ParsedSurveyCake {
  title: string;
  description?: string;
  questions: ParsedQuestion[];
  warnings: string[];
}

const SINGLE = new Set(['CHOICEONE', 'DROPDOWN']);
const MULTI = new Set(['CHOICEMULTI', 'PICKFROM', 'ADVANCED_SELECTION_BASED']);
const TEXT = new Set(['TXTSHORT', 'TXTLONG']);
const SKIP = new Set(['STATEMENT', 'QUOTE', 'NESTCHILD', 'DIVIDER']);

const MAX_OPTIONS = 50;
const MAX_TITLE = 1000;

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function optionLabels(subject: NativeSubject): string[] {
  return (subject.options ?? [])
    .filter((o) => !o.invisible)
    .map((o) => (o.text ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
}

export function parseSurveyCakeNative(raw: unknown): ParsedSurveyCake {
  const data = (raw ?? {}) as Record<string, unknown>;
  const warnings: string[] = [];

  const title =
    (typeof data.title === 'string' && data.title.trim().slice(0, 200)) ||
    '(SurveyCake 匯入) 未命名問卷';
  const description =
    typeof data.welcometext === 'string' && data.welcometext.trim()
      ? stripHtml(data.welcometext).slice(0, 2000) || undefined
      : undefined;

  const subjects = Array.isArray(data.subjects) ? (data.subjects as NativeSubject[]) : [];
  const questions: ParsedQuestion[] = [];

  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i];
    if (!s || typeof s !== 'object') continue;
    if (s.invisible) continue;

    const type = (s.type ?? '').toUpperCase();
    const text = stripHtml(String(s.text ?? '')).slice(0, MAX_TITLE);
    if (SKIP.has(type) || !text) continue;

    const base = {
      title: text,
      sortOrder: questions.length,
      isRequired: Boolean(s.required),
      config: {} as Record<string, unknown>,
    };

    if (type === 'NEST' || type === 'NEST_MULTI') {
      // 後續連續的 NESTCHILD 是矩陣列;NEST 自身 options 是量表欄
      const rows: string[] = [];
      for (let j = i + 1; j < subjects.length; j++) {
        const child = subjects[j];
        if ((child?.type ?? '').toUpperCase() !== 'NESTCHILD') break;
        if (child?.invisible) continue;
        const rowText = stripHtml(String(child.text ?? ''));
        if (rowText) rows.push(rowText);
      }
      const columns = optionLabels(s);
      if (rows.length === 0 || columns.length === 0) {
        warnings.push(`第 ${i + 1} 題「${text}」矩陣缺少列或欄,已轉為文字題`);
        questions.push({ ...base, type: 'text' });
        continue;
      }
      if (type === 'NEST_MULTI') {
        warnings.push(`第 ${i + 1} 題「${text}」為複選矩陣,已降級為單選矩陣(每列僅能選一項)`);
      }
      questions.push({ ...base, type: 'matrix', config: { matrix: { rows, columns } } });
      continue;
    }

    if (SINGLE.has(type) || MULTI.has(type)) {
      const labels = optionLabels(s);
      if (labels.length === 0) {
        warnings.push(`第 ${i + 1} 題「${text}」無有效選項,已轉為文字題`);
        questions.push({ ...base, type: 'text' });
        continue;
      }
      questions.push({
        ...base,
        type: SINGLE.has(type) ? 'single_choice' : 'multiple_choice',
        options: labels.map((label, oi) => ({ label, sortOrder: oi })),
      });
      continue;
    }

    if (!TEXT.has(type)) {
      warnings.push(`第 ${i + 1} 題「${text}」題型「${type}」不支援,已轉為文字題`);
    }
    questions.push({ ...base, type: 'text' });
  }

  return { title, description, questions: questions.slice(0, 50), warnings };
}
