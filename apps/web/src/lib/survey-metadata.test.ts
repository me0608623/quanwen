import { describe, it, expect, vi, afterEach } from 'vitest';
import { surveyMetadata } from './survey-metadata';

function mockFetch(impl: () => Promise<Partial<Response>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = vi.fn(impl as any);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('surveyMetadata', () => {
  it('builds title/og/twitter from the survey title', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ title: '外送習慣調查', description: '一題的小問卷' }),
    }));
    const meta = await surveyMetadata('abc');
    expect(meta.title).toEqual({ absolute: '外送習慣調查 · 券問 QuanWen' });
    expect(meta.description).toBe('一題的小問卷');
    expect(meta.openGraph?.title).toBe('外送習慣調查 · 券問 QuanWen');
    expect((meta.twitter as { card?: string })?.card).toBe('summary');
  });

  it('returns {} when the response is not ok (graceful fallback)', async () => {
    mockFetch(async () => ({ ok: false }));
    expect(await surveyMetadata('missing')).toEqual({});
  });

  it('returns {} when there is no title', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ description: 'x' }) }));
    expect(await surveyMetadata('notitle')).toEqual({});
  });

  it('returns {} when fetch throws (network error)', async () => {
    mockFetch(async () => {
      throw new Error('network down');
    });
    expect(await surveyMetadata('boom')).toEqual({});
  });

  it('trims the title and omits non-string description', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ title: '  你好  ', description: null }) }));
    const meta = await surveyMetadata('t');
    expect(meta.title).toEqual({ absolute: '你好 · 券問 QuanWen' });
    expect(meta.description).toBeUndefined();
  });
});
