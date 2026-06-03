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
  columns?: string[] | Array<{ value: string; text: string }>;
  cellType?: string;
  labelTrue?: string;
  labelFalse?: string;
  rowsVisibleIf?: string;
  visibleIf?: string;
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

  return {
    title: params.title,
    description: params.description,
    pages: [{ name: 'page1', elements }],
    showProgressBar: 'top',
    progressBarType: 'questions',
    questionTitlePattern: 'numRequireTitle',
    triggers: triggers.length > 0 ? triggers : undefined,
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
      return {
        ...base,
        type: isDropdown ? 'dropdown' : 'radiogroup',
        choices: q.options.map((o) => ({ value: o.id, text: o.label })),
      };
    }

    case 'multiple_choice': {
      return {
        ...base,
        type: 'checkbox',
        choices: q.options.map((o) => ({ value: o.id, text: o.label })),
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
        minRateDescription: String(minRating),
        maxRateDescription: String(maxRating),
      };
    }

    case 'matrix': {
      const config = q.config ?? {};
      const matrixConfig = config.matrix as {
        rows?: string[];
        columns?: string[];
        scale?: string;
      } | undefined;

      const rows = (matrixConfig?.rows ?? []).filter(Boolean);
      const columns = (matrixConfig?.columns ?? []).filter(Boolean);

      if (rows.length === 0 || columns.length === 0) {
        // Fallback: render as comment if matrix not configured
        return { ...base, type: 'comment' };
      }

      return {
        ...base,
        type: 'matrix',
        rows: rows.map((r) => ({ value: r, text: r })),
        columns: columns.map((c) => ({ value: c, text: c })),
        cellType: matrixConfig?.scale === 'multiple' ? 'checkbox' : 'radiogroup',
        rowsVisibleIf: undefined,
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
            answer.selectedOptionIds = [raw];
          }
        }
        break;
      }

      case 'multiple_choice': {
        if (Array.isArray(raw)) {
          answer.selectedOptionIds = raw.map(String);
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
