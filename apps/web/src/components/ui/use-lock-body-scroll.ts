import { useEffect } from 'react';

/** locked 為 true 時鎖定 body 捲動（modal 開啟時防止背景捲動）。 */
export function useLockBodyScroll(locked = true): void {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}
