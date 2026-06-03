import { describe, it, expect } from 'vitest';
import { extractApiError } from './extract-error';

describe('extractApiError', () => {
  it('extracts the message from an Axios-style error', () => {
    const err = { response: { data: { message: '餘額不足' } } };
    expect(extractApiError(err)).toBe('餘額不足');
  });

  it('falls back to the default message when structure does not match', () => {
    expect(extractApiError(new Error('boom'))).toBe('操作失敗，請再試一次');
    expect(extractApiError(null)).toBe('操作失敗，請再試一次');
    expect(extractApiError({ response: { data: {} } })).toBe('操作失敗，請再試一次');
  });

  it('uses a custom fallback when provided', () => {
    expect(extractApiError(undefined, '儲值失敗')).toBe('儲值失敗');
  });
});
