/**
 * surveyjs-adapter.ts
 *
 * One-way transformer: QuanWenSurvey v1 (PublicSurvey) → SurveyJS JSON model.
 * Used by the SurveyJS rendering runtime to display surveys to respondents.
 *
 * ADR-0007: Adopt SurveyJS survey-library (MIT) as the rendering runtime.
 */

import type { PublicQuestion } from '@/hooks/use-responses';
import type { SkipLogicRule } from '@/hooks/use-surveys';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';

// ─── SurveyJS JSON types (minimal, for type safety) ────────────────────────

interface SurveyJsChoice {
  value: string;
  text: string;
}

interface SurveyJsQuestion {
  name: string;
  title: string;
  type: string;
  isRequired: boolean;
  description?: string;
  // QUA-279: question image
  imageLink?: string;
  choices?: SurveyJsChoice[];
  rateValues?: { value: number; text: string }[];
  rateMax?: number;
  rateMin?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  inputType?: string;
  maxLength?: number;
  rows?: string[] | Array<{ value: string; text: string }>;
  columns?: string[] | Array<{ value: string; text: string }> | Array<{ name: string; title: string; cellType: string }>;
  cellType?: string;
  labelTrue?: string;
  labelFalse?: string;
  rowsVisibleIf?: string;
  visibleIf?: string;
  // 「其他（請填寫）」選項 → SurveyJS 原生 other item（自動跳出文字輸入框）
  showOtherItem?: boolean;
  otherText?: string;
  otherPlaceholder?: string;
  // 題目影片（type: 'html' 元素，由 buildVideoEmbedUrl 白名單組裝）
  html?: string;
}

// 選項 label 視為「其他」的判定（其他 / 其他（請填寫）/ 其它…）
export function findOtherOption<T extends { id: string; label: string }>(options: T[]): T | undefined {
  return options.find((o) => /^其[他它]/.test(o.label.trim()));
}

/**
 * 題目影片連結 → 安全 embed URL。
 * 白名單僅 YouTube / Vimeo，且 embed URL 由我們組裝（不嵌原始 URL），防任意 iframe 注入。
 * 自動播放需靜音（瀏覽器政策），帶 autoplay+mute 參數。回傳 null = 不渲染。
 */
export function buildVideoEmbedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '');

  // YouTube: watch?v=ID / youtu.be/ID / shorts/ID
  if (host === 'youtube.com' || host === 'youtu.be') {
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] ?? '';
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] ?? '';
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0`;
  }

  // Vimeo: vimeo.com/123456789
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/\/(?:video\/)?(\d{6,12})/);
    if (!m) return null;
    return `https://player.vimeo.com/video/${m[1]}?autoplay=1&muted=1`;
  }

  return null;
}

interface SurveyJsPage {
  name: string;
  elements: SurveyJsQuestion[];
}

export interface SurveyJsModel {
  title?: string;
  description?: string;
  pages: SurveyJsPage[];
  showProgressBar?: 'top' | 'bottom' | 'both';
  progressBarType?: 'pages' | 'questions' | 'requiredQuestions';
  questionTitlePattern?: string;
  triggers?: Array<{ type: 'complete'; expression: string }>;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

/**
 * Convert a QuanWen PublicQuestion array to a SurveyJS JSON model.
 * Each question gets its own page for one-question-per-page UX.
 */
export function quanswenToSurveyJs(params: {
  title?: string;
  description?: string;
  questions: PublicQuestion[];
}): SurveyJsModel {
  const elements = params.questions.map((q) => convertQuestion(q));
  const skipEffects = collectSkipEffects(params.questions);
  const triggers = skipEffects.skipToEndExpressions.map((expression) => ({ type: 'complete' as const, expression }));

  for (const [targetIndex, hiddenExpressions] of skipEffects.hiddenByTargetIndex.entries()) {
    const target = elements[targetIndex];
    if (!target || hiddenExpressions.length === 0) {
      continue;
    }
    const bypassExpression = hiddenExpressions.length === 1
      ? `!(${hiddenExpressions[0]})`
      : `!(${hiddenExpressions.join(' or ')})`;
    target.visibleIf = target.visibleIf
      ? `(${target.visibleIf}) and (${bypassExpression})`
      : bypassExpression;
  }

  // 題目影片 + 區段分頁：必須在 skip-logic 索引處理「之後」進行，
  // 否則 hiddenByTargetIndex 的元素索引會位移。影片元素跟隨題目的 visibleIf 一起顯示/隱藏。
  // 區段（config.sectionBreak = { name, color, description? }）= 新的一頁從該題開始；
  // 每個區段頁的開頭插入彩色區段橫幅（html 元素）。
  const pages: SurveyJsPage[] = [];
  let current: SurveyJsPage = { name: 'page1', elements: [] };

  params.questions.forEach((q, i) => {
    const el = elements[i];
    if (!el) return;

    const sectionBreak = getSectionBreak(q.config);
    if (sectionBreak) {
      // 開新頁（首題就有區段時，捨棄空的 page1）
      if (current.elements.length > 0) pages.push(current);
      current = {
        name: `section-${q.id}`,
        elements: [buildSectionBanner(q.id, sectionBreak)],
      };
    }

    const embedUrl = buildVideoEmbedUrl((q.config as Record<string, unknown> | undefined)?.videoUrl);
    if (embedUrl) {
      current.elements.push({
        name: `${q.id}-video`,
        title: '',
        type: 'html',
        isRequired: false,
        html: `<div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden"><iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`,
        ...(el.visibleIf ? { visibleIf: el.visibleIf } : {}),
      });
    }
    current.elements.push(el);
  });
  if (current.elements.length > 0) pages.push(current);
  if (pages.length === 0) pages.push({ name: 'page1', elements: [] });

  return {
    title: params.title,
    description: params.description,
    pages,
    showProgressBar: 'top',
    progressBarType: 'questions',
    questionTitlePattern: 'numRequireTitle',
    triggers: triggers.length > 0 ? triggers : undefined,
  };
}

// ─── 區段（Section）────────────────────────────────────────────────────────

export interface SectionBreak {
  name: string;
  color?: string;
  description?: string;
}

/** 區段顏色白名單（編輯器調色盤同步）；防任意字串注入 inline style */
export const SECTION_COLORS = [
  '#126b8a', '#0F2A5C', '#8B5CF6', '#10b981', '#f59e0b', '#ef4444', '#64748b',
] as const;

/** 從題目 config 取出區段標記（驗證形狀與顏色白名單） */
export function getSectionBreak(config: unknown): SectionBreak | null {
  const raw = (config as Record<string, unknown> | null | undefined)?.sectionBreak;
  if (!raw || typeof raw !== 'object') return null;
  const sb = raw as Record<string, unknown>;
  const name = typeof sb.name === 'string' ? sb.name.trim().slice(0, 50) : '';
  if (!name) return null;
  const color = typeof sb.color === 'string' && (SECTION_COLORS as readonly string[]).includes(sb.color)
    ? sb.color
    : SECTION_COLORS[0];
  const description = typeof sb.description === 'string' ? sb.description.trim().slice(0, 200) : undefined;
  return { name, color, description };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 區段橫幅：彩色左邊條 + 區段名稱 + 說明（內容經 HTML escape，顏色走白名單） */
function buildSectionBanner(questionId: string, sb: SectionBreak): SurveyJsQuestion {
  const desc = sb.description
    ? `<p style="margin:4px 0 0;font-size:13px;color:#64748b">${escapeHtml(sb.description)}</p>`
    : '';
  return {
    name: `${questionId}-section`,
    title: '',
    type: 'html',
    isRequired: false,
    html: `<div style="border-left:4px solid ${sb.color};background:${sb.color}14;border-radius:8px;padding:10px 14px;margin-bottom:4px"><p style="margin:0;font-size:15px;font-weight:700;color:${sb.color}">${escapeHtml(sb.name)}</p>${desc}</div>`,
  };
}

export function buildVisibleIfExpression(sourceQuestionId: string, rule: SkipLogicRule): string | null {
  if (rule.selectedOptionId) {
    return `{${sourceQuestionId}} = '${rule.selectedOptionId}'`;
  }
  if (typeof rule.selectedRating === 'number') {
    return `{${sourceQuestionId}} >= ${rule.selectedRating}`;
  }
  return null;
}

function collectSkipEffects(questions: PublicQuestion[]): {
  hiddenByTargetIndex: Map<number, string[]>;
  skipToEndExpressions: string[];
} {
  const hiddenByTargetIndex = new Map<number, string[]>();
  const skipToEndExpressions: string[] = [];

  for (let sourceIndex = 0; sourceIndex < questions.length; sourceIndex += 1) {
    const source = questions[sourceIndex];
    const rules = source.config?.skipLogic as SkipLogicRule[] | undefined;
    if (!Array.isArray(rules) || rules.length === 0) {
      continue;
    }

    for (const rule of rules) {
      const expression = buildVisibleIfExpression(source.id, rule);
      if (!expression) {
        continue;
      }

      if (rule.skipToEnd) {
        skipToEndExpressions.push(expression);
      }

      if (typeof rule.skipToQuestionIndex !== 'number' || rule.skipToQuestionIndex <= sourceIndex + 1) {
        continue;
      }

      for (let targetIndex = sourceIndex + 1; targetIndex < Math.min(rule.skipToQuestionIndex, questions.length); targetIndex += 1) {
        const hidden = hiddenByTargetIndex.get(targetIndex) ?? [];
        hidden.push(expression);
        hiddenByTargetIndex.set(targetIndex, hidden);
      }
    }
  }

  return { hiddenByTargetIndex, skipToEndExpressions };
}

function convertQuestion(q: PublicQuestion): SurveyJsQuestion {
  const base: SurveyJsQuestion = {
    name: q.id,
    title: q.title,
    type: 'text', // fallback
    isRequired: q.isRequired,
    description: q.description || undefined,
    // QUA-279: question image — SurveyJS renders image above the question
    imageLink: resolveAssetUrl(q.imageUrl) || undefined,
  };

  switch (q.type) {
    case 'single_choice': {
      // Check for yes_no variant
      const config = q.config ?? {};
      const variant = config.variant as string | undefined;
      const renderAs = config.renderAs as string | undefined;

      if (variant === 'yes_no') {
        return {
          ...base,
          type: 'boolean',
          labelTrue: '是',
          labelFalse: '否',
        };
      }

      const isDropdown = renderAs === 'dropdown';
      const otherOpt = findOtherOption(q.options);
      return {
        ...base,
        type: isDropdown ? 'dropdown' : 'radiogroup',
        choices: q.options.filter((o) => o !== otherOpt).map((o) => ({ value: o.id, text: o.label })),
        ...(otherOpt
          ? { showOtherItem: true, otherText: otherOpt.label, otherPlaceholder: '請填寫' }
          : {}),
      };
    }

    case 'multiple_choice': {
      const otherOpt = findOtherOption(q.options);
      return {
        ...base,
        type: 'checkbox',
        choices: q.options.filter((o) => o !== otherOpt).map((o) => ({ value: o.id, text: o.label })),
        ...(otherOpt
          ? { showOtherItem: true, otherText: otherOpt.label, otherPlaceholder: '請填寫' }
          : {}),
      };
    }

    case 'text': {
      const config = q.config ?? {};
      const inputType = config.inputType as string | undefined;
      const maxLength = config.maxLength as number | undefined;

      if (inputType === 'numeric') {
        return {
          ...base,
          type: 'text',
          inputType: 'number',
        };
      }

      return {
        ...base,
        type: 'comment',
        maxLength: maxLength || undefined,
      };
    }

    case 'rating': {
      const config = q.config ?? {};
      const maxRating = (config.maxRating as number) ?? 5;
      const minRating = config.scaleStart === 0 ? 0 : 1;

      return {
        ...base,
        type: 'rating',
        rateMin: minRating,
        rateMax: maxRating,
        minRateDescription: (config.minLabel as string | undefined) ?? '',
        maxRateDescription: (config.maxLabel as string | undefined) ?? '',
      };
    }

    case 'matrix': {
      const config = q.config ?? {};
      const matrixConfig = config.matrix as {
        rows?: string[];
        columns?: string[];
        multiple?: boolean;
      } | undefined;

      const rows = (matrixConfig?.rows ?? []).filter(Boolean);
      const columns = (matrixConfig?.columns ?? []).filter(Boolean);

      if (rows.length === 0 || columns.length === 0) {
        // Fallback: render as comment if matrix not configured
        return { ...base, type: 'comment' };
      }

      // 每列可複選 → SurveyJS matrixdropdown，每欄一個 boolean 勾選格（核取方格 grid）
      if (matrixConfig?.multiple) {
        return {
          ...base,
          type: 'matrixdropdown',
          rows: rows.map((r) => ({ value: r, text: r })),
          columns: columns.map((c) => ({ name: c, title: c, cellType: 'boolean' })),
        };
      }

      // 每列單選 → SurveyJS matrix（radio）
      return {
        ...base,
        type: 'matrix',
        rows: rows.map((r) => ({ value: r, text: r })),
        columns: columns.map((c) => ({ value: c, text: c })),
      };
    }

    default: {
      return { ...base, type: 'comment' };
    }
  }
}

// ─── Result extractor ──────────────────────────────────────────────────────

/**
 * Extract QuanWen AnswerInput[] from a SurveyJS result set.
 */
export function extractAnswers(
  surveyJsData: Record<string, unknown>,
  questions: PublicQuestion[],
): Array<{
  questionId: string;
  textAnswer?: string;
  selectedOptionIds?: string[];
  ratingValue?: number;
}> {
  return questions.map((q) => {
    const raw = surveyJsData[q.id];
    const answer: {
      questionId: string;
      textAnswer?: string;
      selectedOptionIds?: string[];
      ratingValue?: number;
    } = { questionId: q.id };

    switch (q.type) {
      case 'single_choice': {
        const config = q.config ?? {};
        const variant = config.variant as string | undefined;
        if (variant === 'yes_no') {
          // boolean → map to yes/no option ids
          const val = raw as boolean | undefined;
          answer.selectedOptionIds = val === true ? ['yes'] : val === false ? ['no'] : undefined;
        } else {
          if (typeof raw === 'string') {
            // SurveyJS 的「其他」選項回傳值為 'other'，輸入內容在 `${id}-Comment`
            if (raw === 'other') {
              const otherOpt = findOtherOption(q.options);
              if (otherOpt) {
                answer.selectedOptionIds = [otherOpt.id];
                const comment = surveyJsData[`${q.id}-Comment`];
                if (typeof comment === 'string' && comment.trim()) answer.textAnswer = comment.trim();
              }
            } else {
              answer.selectedOptionIds = [raw];
            }
          }
        }
        break;
      }

      case 'multiple_choice': {
        if (Array.isArray(raw)) {
          const ids = raw.map(String);
          const otherIdx = ids.indexOf('other');
          if (otherIdx !== -1) {
            const otherOpt = findOtherOption(q.options);
            if (otherOpt) {
              ids[otherIdx] = otherOpt.id;
              const comment = surveyJsData[`${q.id}-Comment`];
              if (typeof comment === 'string' && comment.trim()) answer.textAnswer = comment.trim();
            } else {
              ids.splice(otherIdx, 1);
            }
          }
          answer.selectedOptionIds = ids;
        }
        break;
      }

      case 'text': {
        const config = q.config ?? {};
        const inputType = config.inputType as string | undefined;
        if (inputType === 'numeric') {
          answer.textAnswer = raw != null ? String(raw) : undefined;
        } else {
          answer.textAnswer = typeof raw === 'string' ? raw : undefined;
        }
        break;
      }

      case 'rating': {
        if (typeof raw === 'number') {
          answer.ratingValue = raw;
        }
        break;
      }

      case 'matrix': {
        if (raw && typeof raw === 'object') {
          answer.textAnswer = JSON.stringify(raw);
        }
        break;
      }
    }

    return answer;
  });
}
