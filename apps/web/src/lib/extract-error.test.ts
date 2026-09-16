import { describe, it, expect } from 'vitest';
import { extractApiError, extractSubmitError } from './extract-error';

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

  it('supports NestJS message arrays and nested error.message', () => {
    expect(extractApiError({ response: { data: { message: ['第一個', '第二個'] } } })).toBe('第一個');
    expect(
      extractApiError({ response: { data: { error: { message: '匯入格式錯誤' } } } }),
    ).toBe('匯入格式錯誤');
  });
});

describe('extractSubmitError', () => {
  it('surfaces anti-cheat / quality rejection messages from 400', () => {
    const err = {
      response: {
        status: 400,
        data: { message: '系統偵測到疑似自動化快速填答，已暫停您的填答 24 小時以維護問卷品質。' },
      },
    };
    expect(extractSubmitError(err)).toContain('疑似自動化快速填答');
  });

  it('maps 409 to already-submitted copy', () => {
    expect(extractSubmitError({ response: { status: 409, data: {} } })).toBe('這份問卷你已經填過了');
  });
});
