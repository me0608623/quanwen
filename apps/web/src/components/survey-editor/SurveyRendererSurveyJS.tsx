'use client';

import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { Model, SurveyModel } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
// QUA-141: load Traditional Chinese locale so navigation/validation strings display in zh-TW
import 'survey-core/i18n/traditional-chinese';
import { quanswenToSurveyJs, extractAnswers } from '@/lib/surveyjs-adapter';
import type { PublicSurvey, AnswerInput } from '@/hooks/use-responses';
import { DEFAULT_ACCENT, DEFAULT_BACKGROUND, darkenHex, fontFamilyClass } from './survey-style-panel';

export interface SurveyRendererSurveyJSProps {
  survey: PublicSurvey;
  onSubmit: (answers: AnswerInput[]) => Promise<void>;
  submitting?: boolean;
  /** Called once after the SurveyJS model is created; parent can use it for sidebar integration. */
  onModelReady?: (model: SurveyModel) => void;
}


/**
 * Production SurveyJS renderer for QuanWenSurvey v1.
 * Replaces the hand-rolled QuestionInput + PaginatedSurveyForm.
 */
export function SurveyRendererSurveyJS({
  survey,
  onSubmit,
  submitting = false,
  onModelReady,
}: SurveyRendererSurveyJSProps) {
  const modelRef = useRef<SurveyModel | null>(null);
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  // 套用問卷樣式主題
  const accent = survey.theme?.accentColor ?? DEFAULT_ACCENT;
  const accentDark = darkenHex(accent);
  const bg = survey.theme?.backgroundColor ?? DEFAULT_BACKGROUND;
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

  // Expose model to parent (fires once after mount)
  useEffect(() => {
    if (modelRef.current && onModelReady) {
      onModelReady(modelRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      style={{ '--qw-accent': accent, '--qw-accent-dark': accentDark, '--qw-bg': bg } as CSSProperties}
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
          --sjs-corner-radius: 20px;
          --sjs-shadow-small: none;
          --sjs-shadow-inner: none;
          --sjs-border-default: rgba(15,23,42,0.1);
          --sjs-border-light: rgba(15,23,42,0.08);
          --sjs-questionpanel-hovercolor: #f1f5f9;
          color: #0f172a;
        }
        .surveyjs-wrapper .sd-root-modern {
          --sjs-primary-backcolor: var(--qw-accent);
          --sjs-primary-forecolor: #ffffff;
          --sjs-primary-backcolor-light: color-mix(in srgb, var(--qw-accent) 8%, transparent);
          --sjs-primary-backcolor-dark: var(--qw-accent-dark);
          --sjs-question-background: rgba(255,255,255,0.9);
          --sjs-questionpanel-backcolor: transparent;
          --sjs-general-backcolor: transparent;
          --sjs-general-backcolor-dim: #f8fafc;
          --sjs-font-editorfont-color: #0f172a;
        }
        .surveyjs-wrapper .sd-container-modern {
          margin: 0;
        }
        .surveyjs-wrapper .sd-body__page {
          min-width: 0;
        }
        .surveyjs-wrapper .sd-progress {
          height: 4px;
          overflow: hidden;
          border-radius: 2px;
          background: rgba(0,0,0,0.08);
        }
        .surveyjs-wrapper .sd-progress__bar {
          border-radius: inherit;
          background: var(--qw-accent);
          box-shadow: 0 2px 8px color-mix(in srgb, var(--qw-accent) 30%, transparent);
          transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        .surveyjs-wrapper .sd-container-modern__title {
          display: none;
        }
        .surveyjs-wrapper .sd-page__title {
          display: none;
        }
        /* ===== Question cards — light glassmorphism ===== */
        .surveyjs-wrapper .sd-question {
          margin-bottom: 1.5rem;
          overflow: hidden;
          border: 1px solid rgba(15,23,42,0.1);
          border-radius: 20px;
          background: #ffffff;
          backdrop-filter: blur(20px) saturate(180%);
          box-shadow:
            0 1px 3px rgba(15,23,42,0.08),
            0 8px 24px rgba(15,23,42,0.06);
          transition:
            transform 300ms cubic-bezier(0.4,0,0.2,1),
            border-color 300ms ease,
            box-shadow 300ms ease;
        }
        .surveyjs-wrapper .sd-question:focus-within {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--qw-accent) 30%, transparent);
          box-shadow:
            inset 3px 0 0 var(--qw-accent),
            0 8px 32px color-mix(in srgb, var(--qw-accent) 10%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.8);
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
          color: #2563eb;
        }
        /* ===== Question number badge — deep blue ===== */
        .surveyjs-wrapper .sd-question__num,
        .surveyjs-wrapper .sd-element__num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          padding: 0 6px;
          border-radius: 8px;
          background: var(--qw-accent);
          color: #ffffff;
          font-weight: 600;
          font-size: 14px;
          line-height: 1;
          flex-shrink: 0;
        }
        .surveyjs-wrapper .sd-description {
          color: #475569;
          line-height: 1.65;
        }
        /* ===== Option items — light cards ===== */
        .surveyjs-wrapper .sd-item {
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.08);
          background: #ffffff;
          transition:
            background 300ms cubic-bezier(0.4,0,0.2,1),
            border-color 300ms ease,
            box-shadow 300ms ease,
            transform 300ms cubic-bezier(0.4,0,0.2,1);
        }
        .surveyjs-wrapper .sd-item:hover {
          background: #f1f5f9;
          border-color: color-mix(in srgb, var(--qw-accent) 20%, transparent);
          transform: translateY(-1px);
          box-shadow: 0 8px 32px color-mix(in srgb, var(--qw-accent) 10%, transparent);
        }
        .surveyjs-wrapper .sd-item--checked {
          background: color-mix(in srgb, var(--qw-accent) 8%, transparent);
          border-color: color-mix(in srgb, var(--qw-accent) 40%, transparent);
          box-shadow:
            0 0 20px color-mix(in srgb, var(--qw-accent) 15%, transparent),
            inset 0 0 12px color-mix(in srgb, var(--qw-accent) 5%, transparent);
        }
        .surveyjs-wrapper .sd-item--checked .sd-item__control-label {
          color: var(--qw-accent);
        }
        .surveyjs-wrapper .sd-item__decorator {
          border-color: rgba(0,0,0,0.2);
        }
        .surveyjs-wrapper .sd-item__control-label {
          color: #0f172a;
        }
        /* ===== Buttons — primary dark blue ===== */
        .surveyjs-wrapper .sd-btn {
          background: var(--qw-accent);
          border-color: transparent;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          min-height: 2.75rem;
          padding-inline: 1.4rem;
          transition:
            background 200ms ease,
            transform 200ms cubic-bezier(0.4,0,0.2,1);
        }
        .surveyjs-wrapper .sd-btn:hover {
          background: var(--qw-accent-dark);
        }
        .surveyjs-wrapper .sd-btn:active {
          transform: scale(0.97);
        }
        .surveyjs-wrapper .sd-btn:focus-visible,
        .surveyjs-wrapper input:focus-visible,
        .surveyjs-wrapper textarea:focus-visible,
        .surveyjs-wrapper select:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--qw-accent) 30%, transparent);
          outline-offset: 2px;
        }
        .surveyjs-wrapper .sd-navigation__complete-btn {
          background: var(--qw-accent);
          border-color: transparent;
          color: white;
        }
        .surveyjs-wrapper .sd-navigation__complete-btn:hover {
          background: var(--qw-accent-dark);
        }
        /* ===== Inputs — light ===== */
        .surveyjs-wrapper .sd-input,
        .surveyjs-wrapper .sd-comment {
          border-radius: 8px;
          border-color: rgba(0,0,0,0.08);
          background: #ffffff;
          color: #0f172a;
          transition:
            border-color 200ms ease,
            box-shadow 200ms ease;
        }
        .surveyjs-wrapper .sd-input:focus,
        .surveyjs-wrapper .sd-comment:focus {
          border-color: var(--qw-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--qw-accent) 10%, transparent);
        }
        .surveyjs-wrapper .sd-input::placeholder,
        .surveyjs-wrapper .sd-comment::placeholder {
          color: #94a3b8;
        }
        /* ===== Rating ===== */
        .surveyjs-wrapper .sd-rating {
          color: #94a3b8;
        }
        .surveyjs-wrapper .sd-rating__item {
          color: #94a3b8;
          transition: color 200ms ease, transform 200ms ease;
        }
        .surveyjs-wrapper .sd-rating__item:hover {
          color: #475569;
          transform: scale(1.15);
        }
        .surveyjs-wrapper .sd-rating__item--selected {
          color: var(--qw-accent);
        }
        /* ===== Matrix ===== */
        .surveyjs-wrapper .sd-matrix__label {
          color: #475569;
        }
        .surveyjs-wrapper .sd-table {
          border-color: rgba(0,0,0,0.08);
        }
        .surveyjs-wrapper .sd-table th {
          color: #475569;
        }
        .surveyjs-wrapper .sd-table td {
          border-color: rgba(0,0,0,0.06);
        }
        /* ===== Validation errors ===== */
        .surveyjs-wrapper .sd-question__erbox {
          color: #dc2626;
          background: #fef2f2;
          border-color: #fca5a5;
          border-radius: 10px;
        }
        /* ===== Reduced motion ===== */
        @media (prefers-reduced-motion: reduce) {
          .surveyjs-wrapper .sd-question,
          .surveyjs-wrapper .sd-btn,
          .surveyjs-wrapper .sd-progress__bar,
          .surveyjs-wrapper .sd-item,
          .surveyjs-wrapper .sd-rating__item {
            transition: none;
          }
          .surveyjs-wrapper .sd-question:focus-within,
          .surveyjs-wrapper .sd-btn:hover,
          .surveyjs-wrapper .sd-item:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
