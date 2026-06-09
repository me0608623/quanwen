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
    // 顯示填答進度（已答題數），讓受試者知道還剩多少；單頁問卷也適用
    model.showProgressBar = 'top';
    model.progressBarType = 'questions';
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
      className={`surveyjs-wrapper mt-5 ${fontClass}`}
      style={{ '--qw-accent': accent, '--qw-accent-dark': accentDark } as CSSProperties}
    >
      <Survey model={model} />
      <style jsx global>{`
        .surveyjs-wrapper {
          --sjs-font-family: inherit;
        }
        .surveyjs-wrapper .sd-root-modern,
        .surveyjs-wrapper .sd-body,
        .surveyjs-wrapper .sd-body.sd-body--static,
        .surveyjs-wrapper .sd-container-modern {
          background: transparent;
          box-shadow: none;
        }
        .surveyjs-wrapper .sd-root-modern {
          --sjs-corner-radius: 18px;
          --sjs-shadow-small: none;
          --sjs-shadow-inner: none;
          --sjs-border-default: rgba(148, 163, 184, 0.28);
          --sjs-border-light: rgba(226, 232, 240, 0.95);
          --sjs-questionpanel-hovercolor: #ffffff;
          color: #0f172a;
        }
        .surveyjs-wrapper .sd-root-modern {
          --sjs-primary-backcolor: var(--qw-accent, #126b8a);
          --sjs-primary-forecolor: #ffffff;
          --sjs-primary-backcolor-light: color-mix(in srgb, var(--qw-accent, #126b8a) 10%, transparent);
          --sjs-primary-backcolor-dark: var(--qw-accent-dark, #0f5d78);
          /* ⚠️ SurveyJS 的 fallback 鏈會撿到 shadcn 的 --background（HSL 分量格式，非合法色值）
             導致題目卡背景變透明、題目全部黏在一起。明確定義 SJS 變數，讓 fallback 不會走到 --background。 */
          --sjs-question-background: #ffffff;
          --sjs-questionpanel-backcolor: #ffffff;
          --sjs-general-backcolor: #ffffff;
          --sjs-general-backcolor-dim: #f1f3f5;
        }
        .surveyjs-wrapper .sd-container-modern {
          margin: 0;
        }
        .surveyjs-wrapper .sd-body__page {
          min-width: 0;
        }
        .surveyjs-wrapper .sd-progress {
          height: 0.5rem;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(226, 232, 240, 0.86);
        }
        .surveyjs-wrapper .sd-progress__bar {
          border-radius: inherit;
          background: linear-gradient(90deg, var(--qw-accent, #126b8a), var(--qw-accent-dark, #0f5d78));
          transition: width 240ms ease;
        }
        /* 只隱藏「問卷層級」標題（頁首已另行顯示）。
           ⚠️ 不能用 .sd-title 一刀切 — SurveyJS 每題標題也帶 sd-title class，
           曾導致填答頁看不到題目文字、選項全部連在一起。 */
        .surveyjs-wrapper .sd-container-modern__title {
          display: none;
        }
        .surveyjs-wrapper .sd-page__title {
          display: none;
        }
        /* 題目卡之間留間距，題目不互相黏在一起 */
        .surveyjs-wrapper .sd-question {
          margin-bottom: 0.9rem;
          overflow: hidden;
          border: 1px solid rgba(226, 232, 240, 0.96);
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 18px 56px rgba(15, 23, 42, 0.06);
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }
        .surveyjs-wrapper .sd-question:focus-within {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--qw-accent, #126b8a) 36%, rgba(226, 232, 240, 1));
          box-shadow: 0 22px 70px rgba(15, 23, 42, 0.09);
        }
        .surveyjs-wrapper .sd-question__header {
          padding-bottom: 0.4rem;
        }
        .surveyjs-wrapper .sd-question__title {
          font-size: 1rem;
          font-weight: 650;
          letter-spacing: -0.01em;
          color: #0f172a;
        }
        .surveyjs-wrapper .sd-question__required-text {
          color: var(--qw-accent, #126b8a);
        }
        .surveyjs-wrapper .sd-description {
          color: #64748b;
          line-height: 1.65;
        }
        .surveyjs-wrapper .sd-btn {
          background-color: var(--qw-accent, #126b8a);
          border-color: var(--qw-accent, #126b8a);
          border-radius: 999px;
          color: white;
          font-weight: 600;
          min-height: 2.75rem;
          padding-inline: 1.2rem;
          transition:
            transform 160ms ease,
            background-color 160ms ease,
            box-shadow 160ms ease;
        }
        .surveyjs-wrapper .sd-btn:hover {
          transform: translateY(-1px);
          background-color: var(--qw-accent-dark, #0f5d78);
          box-shadow: 0 14px 32px color-mix(in srgb, var(--qw-accent, #126b8a) 22%, transparent);
        }
        .surveyjs-wrapper .sd-btn:focus-visible,
        .surveyjs-wrapper input:focus-visible,
        .surveyjs-wrapper textarea:focus-visible,
        .surveyjs-wrapper select:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--qw-accent, #126b8a) 42%, transparent);
          outline-offset: 2px;
        }
        .surveyjs-wrapper .sd-navigation__complete-btn {
          background-color: var(--qw-accent, #126b8a);
          border-color: var(--qw-accent, #126b8a);
          color: white;
        }
        .surveyjs-wrapper .sd-input,
        .surveyjs-wrapper .sd-comment {
          border-radius: 16px;
          border-color: rgba(203, 213, 225, 0.95);
          background: rgba(248, 250, 252, 0.72);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            background-color 160ms ease;
        }
        .surveyjs-wrapper .sd-input:focus,
        .surveyjs-wrapper .sd-comment:focus {
          border-color: color-mix(in srgb, var(--qw-accent, #126b8a) 44%, rgba(203, 213, 225, 1));
          background: #ffffff;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--qw-accent, #126b8a) 10%, transparent);
        }
        .surveyjs-wrapper .sd-item {
          border-radius: 14px;
          transition:
            background-color 160ms ease,
            color 160ms ease;
        }
        .surveyjs-wrapper .sd-item:hover {
          background: rgba(241, 245, 249, 0.75);
        }
        .surveyjs-wrapper .sd-item--checked .sd-item__control-label {
          color: var(--qw-accent, #126b8a);
        }
        .surveyjs-wrapper .sd-item__decorator {
          border-color: rgba(148, 163, 184, 0.9);
        }
        .surveyjs-wrapper .sd-rating__item--selected {
          color: var(--qw-accent, #126b8a);
        }
        @media (prefers-reduced-motion: reduce) {
          .surveyjs-wrapper .sd-question,
          .surveyjs-wrapper .sd-btn,
          .surveyjs-wrapper .sd-progress__bar {
            transition: none;
          }
          .surveyjs-wrapper .sd-question:focus-within,
          .surveyjs-wrapper .sd-btn:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
