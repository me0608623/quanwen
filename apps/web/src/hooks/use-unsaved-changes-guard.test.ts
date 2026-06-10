import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

describe('useUnsavedChangesGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds beforeunload listener when dirty', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesGuard(true));
    expect(spy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('does not add beforeunload listener when not dirty', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesGuard(false));
    const calls = spy.mock.calls.map(([event]) => event);
    expect(calls).not.toContain('beforeunload');
  });

  it('removes beforeunload listener on cleanup', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('removes beforeunload listener when isDirty transitions to false', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty), {
      initialProps: { dirty: true },
    });
    rerender({ dirty: false });
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('adds popstate listener when dirty', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesGuard(true));
    expect(spy).toHaveBeenCalledWith('popstate', expect.any(Function));
  });

  it('does not add popstate listener when not dirty', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesGuard(false));
    const calls = spy.mock.calls.map(([event]) => event);
    expect(calls).not.toContain('popstate');
  });

  it('calls confirm and cancels navigation when dirty and popstate fires', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    renderHook(() => useUnsavedChangesGuard(true));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(confirmSpy).toHaveBeenCalledWith('有未儲存的變更，確定要離開嗎？');
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', window.location.href);
  });

  it('allows navigation when user confirms leaving', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    renderHook(() => useUnsavedChangesGuard(true));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(pushStateSpy).not.toHaveBeenCalled();
  });
});
