'use client';

import { useRef } from 'react';
import type { SurveyQuestion, SurveyTheme } from '@/hooks/use-surveys';
import { SurveyPreviewPlayer } from './survey-preview-player';
import { useEscapeKey } from '@/components/ui/use-escape-key';
import { useLockBodyScroll } from '@/components/ui/use-lock-body-scroll';
import { useFocusTrap } from '@/components/ui/use-focus-trap';

interface Props {
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  theme?: SurveyTheme;
  open: boolean;
  onClose: () => void;
}

export function SurveyPreviewModal({ title, description, questions, theme, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose, open);
  useLockBodyScroll(open);
  useFocusTrap(dialogRef, open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="問卷預覽"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl"
      >
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
