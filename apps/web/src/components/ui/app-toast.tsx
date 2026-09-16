'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AppToastTone = 'success' | 'error' | 'info';

export type AppToastState = {
  message: string;
  tone: AppToastTone;
};

const TONE_CLASS: Record<AppToastTone, string> = {
  success: 'bg-emerald-700 text-white',
  error: 'bg-red-700 text-white',
  info: 'bg-slate-900 text-white',
};

export function AppToast({
  message,
  tone = 'info',
  onClose,
}: {
  message: string;
  tone?: AppToastTone;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 right-4 z-[60] max-w-sm cursor-pointer rounded-md px-4 py-2.5 text-sm shadow-lg ${TONE_CLASS[tone]}`}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

/** Local timed toast helper — no global provider required. */
export function useAppToast(durationMs = 3500) {
  const [toast, setToast] = useState<AppToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, tone: AppToastTone = 'error') => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, tone });
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const toastNode = toast ? (
    <AppToast message={toast.message} tone={toast.tone} onClose={dismiss} />
  ) : null;

  return { toast, showToast, dismiss, toastNode };
}
