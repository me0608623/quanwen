// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeKey } from './use-escape-key';

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('useEscapeKey', () => {
  it('calls handler on Escape', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler));
    pressKey('Escape');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler));
    pressKey('Enter');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not subscribe when disabled', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeKey(handler, false));
    pressKey('Escape');
    expect(handler).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(handler));
    unmount();
    pressKey('Escape');
    expect(handler).not.toHaveBeenCalled();
  });
});
