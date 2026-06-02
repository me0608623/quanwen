'use client';

import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { Model, SurveyModel } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
// QUA-141: load Traditional Chinese locale so navigation/validation strings display in zh-TW
import 'survey-core/i18n/traditional-chinese';
import { quanswenToSurveyJs, extractAnswers } from '@/lib/surveyjs-adapter';
import type { PublicSurvey, AnswerInput } from '@/hooks/use-responses';
import { DEFAULT_ACCENT, fontFamilyClass } from './survey-style-panel';

export interface SurveyRendererSurveyJSProps {
  survey: PublicSurvey;
  onSubmit: (answers: AnswerInput[]) => Promise<void>;
  submitting?: boolean;
}

// 把 hex 主色壓暗一階，給按鈕 hover / dark 變體用
function darkenHex(hex: string, amount = 0.15): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const r = Math.max(0, Math.round(((num >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 255) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Production SurveyJS renderer for QuanWenSurvey v1.
 * Replaces the hand-rolled QuestionInput + PaginatedSurveyForm.
 */
export function SurveyRendererSurveyJS({
  survey,
  onSubmit,
  submitting = false,
}: SurveyRendererSurveyJSProps) {
  const modelRef = useRef<SurveyModel | null>(null);
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  // 套用問卷樣式主題
  const accent = survey.theme?.accentColor ?? DEFAULT_ACCENT;
  const accentDark = darkenHex(accent);
  const fontClass = fontFamilyClass(survey.theme?.fontFamily);

  // Build the SurveyJS model once from the QuanWen survey data
  const surveyJsJson = quanswenToSurveyJs({
    title: survey.title,
    description: survey.description,
    questions: survey.questions,
  });

  // Create model lazily
  if (!modelRef.current) {
    const model = new Model(surveyJsJson);
    model.showQuestionNumbers = 'on';
    model.questionTitlePattern = 'numRequireTitle';
    // QUA-141: use Traditional Chinese for all built-in SurveyJS strings
    model.locale = 'zh-tw';

    // We'll handle completion via onComplete callback
    modelRef.current = model;
  }

  const model = modelRef.current;

  const handleComplete = useCallback(
    async (sender: SurveyModel) => {
      if (submittingRef.current) return; // prevent double submit

      const data = sender.data;
      const answers = extractAnswers(data, survey.questions);
      await onSubmit(answers);
    },
    [survey.questions, onSubmit],
  );

  useEffect(() => {
    model.onComplete.add(handleComplete);
    return () => {
      model.onComplete.remove(handleComplete);
    };
  }, [model, handleComplete]);

  // Apply custom styling — accent 由問卷主題注入（CSS 變數），可被發問卷方覆寫
  return (
    <div
      className={`surveyjs-wrapper ${fontClass}`}
      style={{ '--qw-accent': accent, '--qw-accent-dark': accentDark } as CSSProperties}
    >
      <Survey model={model} />
      <style jsx global>{`
        .surveyjs-wrapper {
          --sjs-font-family: inherit;
        }
        .surveyjs-wrapper .sd-root-modern {
          --sjs-primary-backcolor: var(--qw-accent, #126b8a);
          --sjs-primary-forecolor: #ffffff;
          --sjs-primary-backcolor-light: color-mix(in srgb, var(--qw-accent, #126b8a) 10%, transparent);
          --sjs-primary-backcolor-dark: var(--qw-accent-dark, #0f5d78);
        }
        .surveyjs-wrapper .sd-title {
          display: none;
        }
        .surveyjs-wrapper .sd-page__title {
          display: none;
        }
        .surveyjs-wrapper .sd-btn {
          background-color: var(--qw-accent, #126b8a);
          border-color: var(--qw-accent, #126b8a);
          color: white;
          font-weight: 600;
        }
        .surveyjs-wrapper .sd-btn:hover {
          background-color: var(--qw-accent-dark, #0f5d78);
        }
        .surveyjs-wrapper .sd-navigation__complete-btn {
          background-color: var(--qw-accent, #126b8a);
          border-color: var(--qw-accent, #126b8a);
          color: white;
        }
        .surveyjs-wrapper .sd-item--checked .sd-item__control-label {
          color: var(--qw-accent, #126b8a);
        }
        .surveyjs-wrapper .sd-rating__item--selected {
          color: var(--qw-accent, #126b8a);
        }
      `}</style>
    </div>
  );
}
