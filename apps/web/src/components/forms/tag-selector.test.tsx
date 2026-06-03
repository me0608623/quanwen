// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagSelector } from './tag-selector';

const TAGS = [
  { id: 't1', name: '美食', category: 'lifestyle' },
  { id: 't2', name: '旅遊', category: 'lifestyle' },
  { id: 't3', name: '科技', category: 'lifestyle' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any;

describe('TagSelector', () => {
  it('shows the selected count over the max', () => {
    render(<TagSelector tags={TAGS} selected={[]} onChange={() => {}} maxSelect={2} />);
    expect(screen.getByText('已選 0/2 個標籤')).toBeTruthy();
  });

  it('adds an unselected tag on click', () => {
    const onChange = vi.fn();
    render(<TagSelector tags={TAGS} selected={[]} onChange={onChange} maxSelect={2} />);
    fireEvent.click(screen.getByRole('button', { name: '美食' }));
    expect(onChange).toHaveBeenCalledWith(['t1']);
  });

  it('removes an already-selected tag on click', () => {
    const onChange = vi.fn();
    render(<TagSelector tags={TAGS} selected={['t1']} onChange={onChange} maxSelect={2} />);
    fireEvent.click(screen.getByRole('button', { name: '美食' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('disables and ignores extra tags once maxSelect is reached', () => {
    const onChange = vi.fn();
    render(<TagSelector tags={TAGS} selected={['t1', 't2']} onChange={onChange} maxSelect={2} />);
    const third = screen.getByRole('button', { name: '科技' });
    expect((third as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(third);
    expect(onChange).not.toHaveBeenCalled();
  });
});
