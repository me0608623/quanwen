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
  /** Called once after the SurveyJS model is created; parent can use it for sidebar integration. */
  onModelReady?: (model: SurveyModel) => void;
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
  onModelReady,
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
          --sjs-corner-radius: 20px;
          --sjs-shadow-small: none;
          --sjs-shadow-inner: none;
          --sjs-border-default: rgba(255,255,255,0.15);
          --sjs-border-light: rgba(255,255,255,0.1);
          --sjs-questionpanel-hovercolor: rgba(255,255,255,0.12);
          color: #f1f5f9;
        }
        .surveyjs-wrapper .sd-root-modern {
          --sjs-primary-backcolor: #2563eb;
          --sjs-primary-forecolor: #ffffff;
          --sjs-primary-backcolor-light: rgba(37,99,235,0.15);
          --sjs-primary-backcolor-dark: #1d4ed8;
          --sjs-question-background: rgba(255,255,255,0.06);
          --sjs-questionpanel-backcolor: transparent;
          --sjs-general-backcolor: transparent;
          --sjs-general-backcolor-dim: rgba(255,255,255,0.04);
          --sjs-font-editorfont-color: #f1f5f9;
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
          background: rgba(255,255,255,0.1);
        }
        .surveyjs-wrapper .sd-progress__bar {
          border-radius: inherit;
          background: linear-gradient(90deg, #2563eb, #60a5fa);
          box-shadow: 0 0 10px rgba(37,99,235,0.5);
          transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        }
        .surveyjs-wrapper .sd-container-modern__title {
          display: none;
        }
        .surveyjs-wrapper .sd-page__title {
          display: none;
        }
        /* ===== Question cards — glassmorphism ===== */
        .surveyjs-wrapper .sd-question {
          margin-bottom: 0.9rem;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 20px;
          background: linear-gradient(
            145deg,
            rgba(255,255,255,0.08) 0%,
            rgba(37,99,235,0.12) 100%
          );
          backdrop-filter: blur(20px) saturate(180%);
          box-shadow:
            0 8px 32px rgba(0,0,0,0.6),
            inset 0 1px 0 rgba(255,255,255,0.1);
          transition:
            transform 300ms cubic-bezier(0.4,0,0.2,1),
            border-color 300ms ease,
            box-shadow 300ms ease;
        }
        .surveyjs-wrapper .sd-question:focus-within {
          transform: translateY(-2px);
          border-color: rgba(96,165,250,0.5);
          box-shadow:
            0 12px 40px rgba(37,99,235,0.2),
            inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .surveyjs-wrapper .sd-question__header {
          padding-bottom: 0.4rem;
        }
        .surveyjs-wrapper .sd-question__title {
          font-size: 1rem;
          font-weight: 650;
          letter-spacing: -0.01em;
          color: #ffffff;
        }
        .surveyjs-wrapper .sd-question__required-text {
          color: #60a5fa;
        }
        .surveyjs-wrapper .sd-description {
          color: rgba(255,255,255,0.6);
          line-height: 1.65;
        }
        /* ===== Option items — glass cards ===== */
        .surveyjs-wrapper .sd-item {
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(
            145deg,
            rgba(255,255,255,0.05) 0%,
            rgba(255,255,255,0.02) 100%
          );
          transition:
            background 300ms cubic-bezier(0.4,0,0.2,1),
            border-color 300ms ease,
            box-shadow 300ms ease,
            transform 300ms cubic-bezier(0.4,0,0.2,1);
        }
        .surveyjs-wrapper .sd-item:hover {
          background: linear-gradient(
            145deg,
            rgba(255,255,255,0.12) 0%,
            rgba(37,99,235,0.15) 100%
          );
          border-color: rgba(96,165,250,0.5);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(37,99,235,0.2);
        }
        .surveyjs-wrapper .sd-item--checked {
          background: linear-gradient(
            145deg,
            rgba(37,99,235,0.3) 0%,
            rgba(29,78,216,0.25) 100%
          );
          border-color: rgba(96,165,250,0.8);
          box-shadow:
            0 0 30px rgba(37,99,235,0.3),
            inset 0 0 20px rgba(255,255,255,0.05);
        }
        .surveyjs-wrapper .sd-item--checked .sd-item__control-label {
          color: #93c5fd;
        }
        .surveyjs-wrapper .sd-item__decorator {
          border-color: rgba(255,255,255,0.3);
        }
        .surveyjs-wrapper .sd-item__control-label {
          color: rgba(255,255,255,0.85);
        }
        /* ===== Buttons — glass blue ===== */
        .surveyjs-wrapper .sd-btn {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          border-color: transparent;
          border-radius: 999px;
          color: white;
          font-weight: 600;
          min-height: 2.75rem;
          padding-inline: 1.4rem;
          transition:
            transform 200ms cubic-bezier(0.4,0,0.2,1),
            box-shadow 200ms ease;
        }
        .surveyjs-wrapper .sd-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(37,99,235,0.4);
        }
        .surveyjs-wrapper .sd-btn:active {
          transform: scale(0.95);
        }
        .surveyjs-wrapper .sd-btn:focus-visible,
        .surveyjs-wrapper input:focus-visible,
        .surveyjs-wrapper textarea:focus-visible,
        .surveyjs-wrapper select:focus-visible {
          outline: 2px solid rgba(96,165,250,0.6);
          outline-offset: 2px;
        }
        .surveyjs-wrapper .sd-navigation__complete-btn {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          border-color: transparent;
          color: white;
        }
        /* ===== Inputs — glass dark ===== */
        .surveyjs-wrapper .sd-input,
        .surveyjs-wrapper .sd-comment {
          border-radius: 12px;
          border-color: rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.06);
          color: #f1f5f9;
          transition:
            border-color 200ms ease,
            box-shadow 200ms ease,
            background-color 200ms ease;
        }
        .surveyjs-wrapper .sd-input:focus,
        .surveyjs-wrapper .sd-comment:focus {
          border-color: rgba(96,165,250,0.6);
          background: rgba(255,255,255,0.1);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.2);
        }
        .surveyjs-wrapper .sd-input::placeholder,
        .surveyjs-wrapper .sd-comment::placeholder {
          color: rgba(255,255,255,0.3);
        }
        /* ===== Rating ===== */
        .surveyjs-wrapper .sd-rating {
          color: rgba(255,255,255,0.4);
        }
        .surveyjs-wrapper .sd-rating__item {
          color: rgba(255,255,255,0.4);
          transition: color 200ms ease, transform 200ms ease;
        }
        .surveyjs-wrapper .sd-rating__item:hover {
          color: rgba(255,255,255,0.7);
          transform: scale(1.15);
        }
        .surveyjs-wrapper .sd-rating__item--selected {
          color: #60a5fa;
        }
        /* ===== Matrix ===== */
        .surveyjs-wrapper .sd-matrix__label {
          color: rgba(255,255,255,0.7);
        }
        .surveyjs-wrapper .sd-table {
          border-color: rgba(255,255,255,0.1);
        }
        .surveyjs-wrapper .sd-table th {
          color: rgba(255,255,255,0.6);
        }
        .surveyjs-wrapper .sd-table td {
          border-color: rgba(255,255,255,0.08);
        }
        /* ===== Validation errors ===== */
        .surveyjs-wrapper .sd-question__erbox {
          color: #fca5a5;
          background: rgba(239,68,68,0.15);
          border-color: rgba(239,68,68,0.3);
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
