// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatingScale } from './rating-scale';

describe('RatingScale', () => {
  it('renders one button per scale value', () => {
    render(<RatingScale config={{ maxRating: 5 }} />);
    for (const n of ['1', '2', '3', '4', '5']) {
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
    }
  });

  it('calls onSelect with the clicked value', () => {
    const onSelect = vi.fn();
    render(<RatingScale config={{ maxRating: 5 }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('shows the current value over the max', () => {
    render(<RatingScale config={{ maxRating: 5 }} value={3} />);
    expect(screen.getByText('3 / 5')).toBeTruthy();
  });

  it('renders min/max anchor labels', () => {
    render(<RatingScale config={{ maxRating: 5, minLabel: '非常不同意', maxLabel: '非常同意' }} />);
    expect(screen.getByText('非常不同意')).toBeTruthy();
    expect(screen.getByText('非常同意')).toBeTruthy();
  });

  it('does not call onSelect when disabled', () => {
    const onSelect = vi.fn();
    render(<RatingScale config={{ maxRating: 5 }} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
