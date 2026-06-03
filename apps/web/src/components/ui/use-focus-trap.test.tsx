// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFocusTrap } from './use-focus-trap';

function Trapped({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled);
  return (
    <div ref={ref}>
      <button>a</button>
      <button>b</button>
      <button>c</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('wraps Tab from last to first', () => {
    render(<Trapped />);
    const last = screen.getByRole('button', { name: 'c' });
    const first = screen.getByRole('button', { name: 'a' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from first to last', () => {
    render(<Trapped />);
    const first = screen.getByRole('button', { name: 'a' });
    const last = screen.getByRole('button', { name: 'c' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does not interfere in the middle of the list', () => {
    render(<Trapped />);
    const middle = screen.getByRole('button', { name: 'b' });
    middle.focus();
    fireEvent.keyDown(middle, { key: 'Tab' });
    expect(document.activeElement).toBe(middle); // jsdom does not move focus on Tab; hook should not either
  });

  it('does nothing when disabled', () => {
    render(<Trapped enabled={false} />);
    const last = screen.getByRole('button', { name: 'c' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(last);
  });
});
