// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './loading-spinner';

describe('LoadingSpinner', () => {
  it('exposes an accessible status role with default label', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('載入中');
    expect(screen.getByText('載入中')).toBeTruthy();
  });

  it('honours a custom label', () => {
    render(<LoadingSpinner label="處理中" />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('處理中');
  });
});
