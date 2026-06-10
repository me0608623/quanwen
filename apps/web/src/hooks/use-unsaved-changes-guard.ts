'use client';

import { useEffect } from 'react';

const DEFAULT_MESSAGE = '有未儲存的變更，確定要離開嗎？';

/**
 * Guards against accidental navigation loss when there are unsaved changes.
 *
 * - beforeunload: prompts when the user refreshes or closes the tab
 * - popstate: prompts when the user presses the browser back/forward button
 *
 * Does nothing when isDirty is false.
 */
export function useUnsavedChangesGuard(isDirty: boolean, message = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = () => {
      if (!window.confirm(message)) {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isDirty, message]);
}
