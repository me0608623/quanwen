import { useRef, useCallback } from 'react';

/**
 * WAI-ARIA Tabs keyboard navigation (follows-focus pattern).
 * Handles ArrowLeft/Right, Home, End and moves focus to the activated tab.
 */
export function useTabsKeyboard<T extends string>(
  tabs: readonly T[],
  activeTab: T,
  setTab: (tab: T) => void,
) {
  const tabRefs = useRef<Map<T, HTMLButtonElement | null>>(new Map());

  const registerRef = useCallback((key: T, el: HTMLButtonElement | null) => {
    if (el) {
      tabRefs.current.set(key, el);
    } else {
      tabRefs.current.delete(key);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = tabs.indexOf(activeTab);
      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
          break;
        case 'ArrowRight':
          e.preventDefault();
          newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      const newTab = tabs[newIndex];
      setTab(newTab);
      requestAnimationFrame(() => {
        tabRefs.current.get(newTab)?.focus();
      });
    },
    [tabs, activeTab, setTab],
  );

  return { handleKeyDown, registerRef };
}
