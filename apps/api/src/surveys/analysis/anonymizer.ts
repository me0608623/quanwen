/**
 * 去識別化（SSOT: 問卷資料儲存與規模化設計.md §5.3、ADR-009-D4、個資鐵律）。
 * 純函式。匯出與 AI 分析兩條路徑都先過這裡。
 */
import { createHash } from 'crypto';

const REDACT = '[已遮蔽]';

/** 台灣常見 PII 樣式（順序：先 email/身分證，再電話，最後長數字）。 */
const PII_PATTERNS: ReadonlyArray<RegExp> = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // email
  /\b[A-Z][12]\d{8}\b/g, // 身分證字號
  /\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/g, // 手機
  /\b0\d{1,2}[-\s]?\d{6,8}\b/g, // 市話
  /\b\d{12,19}\b/g, // 卡號等長數字
];

/** 把自由文字中的 PII 遮蔽掉（送 AI / 匯出文字題前必過）。 */
export function redactPii(text: string | null | undefined): string {
  if (!text) return text ?? '';
  let out = text;
  for (const re of PII_PATTERNS) out = out.replace(re, REDACT);
  return out;
}

/**
 * per-survey 穩定假名：同一份問卷內，同一受試者恆得同一假名；跨問卷不可連結。
 * 不可逆（單向 hash），不外洩原始 respondent_id。
 */
export function pseudonym(surveyId: string, respondentId: string): string {
  const h = createHash('sha256').update(`${surveyId}:${respondentId}`).digest('hex');
  return `R-${h.slice(0, 8)}`;
}
