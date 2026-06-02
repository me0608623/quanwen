'use client';

import type { SurveyQuestion, SurveyTheme } from '@/hooks/use-surveys';
import { SurveyPreviewPlayer } from './survey-preview-player';

interface Props {
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  theme?: SurveyTheme;
  open: boolean;
  onClose: () => void;
}

export function SurveyPreviewModal({ title, description, questions, theme, open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            關閉
          </button>
        </div>
        <SurveyPreviewPlayer title={title} description={description} questions={questions} theme={theme} />
      </div>
    </div>
  );
}
