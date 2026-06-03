// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLockBodyScroll } from './use-lock-body-scroll';

afterEach(() => {
  document.body.style.overflow = '';
});

describe('useLockBodyScroll', () => {
  it('locks body overflow while mounted and restores on unmount', () => {
    const { unmount } = renderHook(() => useLockBodyScroll(true));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does nothing when not locked', () => {
    renderHook(() => useLockBodyScroll(false));
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the previous overflow value', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = renderHook(() => useLockBodyScroll(true));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});
