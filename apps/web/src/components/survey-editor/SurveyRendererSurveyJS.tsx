'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Model, SurveyModel } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
import { quanswenToSurveyJs, extractAnswers } from '@/lib/surveyjs-adapter';
import type { PublicSurvey, AnswerInput } from '@/hooks/use-responses';

export interface SurveyRendererSurveyJSProps {
  survey: PublicSurvey;
  onSubmit: (answers: AnswerInput[]) => Promise<void>;
  submitting?: boolean;
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

  // Apply custom styling to match QuanWen branding
  return (
    <div className="surveyjs-wrapper">
      <Survey model={model} />
      <style jsx global>{`
        .surveyjs-wrapper {
          --sjs-font-family: inherit;
        }
        .surveyjs-wrapper .sd-root-modern {
          --sjs-primary-backcolor: #126b8a;
          --sjs-primary-forecolor: #ffffff;
          --sjs-primary-backcolor-light: rgba(18, 107, 138, 0.1);
          --sjs-primary-backcolor-dark: #0f5d78;
        }
        .surveyjs-wrapper .sd-title {
          display: none;
        }
        .surveyjs-wrapper .sd-page__title {
          display: none;
        }
        .surveyjs-wrapper .sd-btn {
          background-color: #126b8a;
          border-color: #126b8a;
          color: white;
          font-weight: 600;
        }
        .surveyjs-wrapper .sd-btn:hover {
          background-color: #0f5d78;
        }
        .surveyjs-wrapper .sd-navigation__complete-btn {
          background-color: #126b8a;
          border-color: #126b8a;
          color: white;
        }
        .surveyjs-wrapper .sd-item--checked .sd-item__control-label {
          color: #126b8a;
        }
        .surveyjs-wrapper .sd-rating__item--selected {
          color: #126b8a;
        }
      `}</style>
    </div>
  );
}
