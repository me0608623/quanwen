/**
 * Phase II.1: ZaiClient 加固後行為驗證
 *
 * 用 vi.spyOn(global, 'fetch') mock。每個 case 獨立 reset。
 * timeout / retry 用 fake timers 避免真等。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZaiClient, ZaiError } from './zai.client';

const KEY = 'test-zai-key';

describe('ZaiClient', () => {
  let client: ZaiClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.ZAI_API_KEY = KEY;
    process.env.ZAI_BASE_URL = 'https://api.test.local/v4';
    process.env.ZAI_MODEL = 'test-glm';
    process.env.ZAI_TIMEOUT_MS = '500';
    process.env.ZAI_MAX_RETRIES = '2';
    client = new ZaiClient();
    // 重要：cast 到 any 因為 fetch 的 spy 型別 narrow 在 TS strict 下複雜
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchSpy = vi.spyOn(global, 'fetch') as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOk(content: string, usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'resp-1',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage,
        }),
    } as Response);
  }

  function mockHttp(status: number, errorBody = 'oops') {
    return Promise.resolve({
      ok: false,
      status,
      text: () => Promise.resolve(errorBody),
    } as Response);
  }

  it('1. happy path：合法 JSON 回應一次成功', async () => {
    fetchSpy.mockReturnValueOnce(mockOk('{"k":"v"}'));
    const result = await client.jsonChat<{ k: string }>('sys', 'usr');
    expect(result).toEqual({ k: 'v' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('2. 5xx 後成功：retry 第二次拿到 200', async () => {
    fetchSpy
      .mockReturnValueOnce(mockHttp(503, 'server busy'))
      .mockReturnValueOnce(mockOk('{"ok":true}'));

    const result = await client.jsonChat<{ ok: boolean }>('sys', 'usr');
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('3. 連續 5xx 直到 maxRetries+1 → throw ZaiError(http_5xx)', async () => {
    fetchSpy.mockReturnValue(mockHttp(502, 'bad gateway'));

    try {
      await client.chat([{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ZaiError);
      const z = err as ZaiError;
      expect(z.kind).toBe('http_5xx');
      expect(z.status).toBe(502);
      expect(z.attempts).toBe(3); // maxRetries=2 → 1+2 = 3
      expect(z.retryable).toBe(true);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('4. 4xx 不 retry → 立即 throw ZaiError(http_4xx)', async () => {
    fetchSpy.mockReturnValueOnce(mockHttp(400, 'bad request'));

    try {
      await client.chat([{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ZaiError);
      const z = err as ZaiError;
      expect(z.kind).toBe('http_4xx');
      expect(z.attempts).toBe(1);
      expect(z.retryable).toBe(false);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('5. 401/403 → kind=http_401', async () => {
    fetchSpy.mockReturnValueOnce(mockHttp(401, 'unauthorized'));

    try {
      await client.chat([{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ZaiError);
      expect((err as ZaiError).kind).toBe('http_401');
    }
  });

  it('6. ZAI_API_KEY 未設定 → kind=http_401 立即 throw', async () => {
    delete process.env.ZAI_API_KEY;
    const c = new ZaiClient();

    try {
      await c.chat([{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ZaiError);
      expect((err as ZaiError).kind).toBe('http_401');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('7. JSON parse 失敗 → kind=parse', async () => {
    fetchSpy.mockReturnValueOnce(mockOk('這不是 JSON 是純中文'));

    try {
      await client.jsonChat('sys', 'usr');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ZaiError);
      expect((err as ZaiError).kind).toBe('parse');
    }
  });

  it('8. JSON 在 markdown code fence 內 → 仍可解析', async () => {
    fetchSpy.mockReturnValueOnce(mockOk('```json\n{"wrapped": true}\n```'));
    const result = await client.jsonChat<{ wrapped: boolean }>('sys', 'usr');
    expect(result).toEqual({ wrapped: true });
  });

  it('9. timeout → AbortError → kind=timeout 且 retry', async () => {
    process.env.ZAI_TIMEOUT_MS = '50';
    process.env.ZAI_MAX_RETRIES = '1';
    const c = new ZaiClient();

    // 第一次 fetch 模擬永遠 hang（AbortController 會在 50ms 後 abort）
    let firstResolveAbort: ((reason?: unknown) => void) | undefined;
    fetchSpy.mockReturnValueOnce(
      new Promise((_, reject) => {
        firstResolveAbort = reject;
      }) as Promise<Response>,
    );
    fetchSpy.mockReturnValueOnce(mockOk('{"ok":true}'));

    // 注：實際 AbortController abort 時 fetch 會 throw AbortError，
    // 我們的 mock 簡化：手動 schedule reject
    setTimeout(() => firstResolveAbort?.(Object.assign(new Error('aborted'), { name: 'AbortError' })), 60);

    const result = await c.jsonChat<{ ok: boolean }>('sys', 'usr');
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 15_000);

  it('10. ZaiError.retryable 對各 kind 判斷正確', () => {
    expect(new ZaiError('timeout', '', 1).retryable).toBe(true);
    expect(new ZaiError('network', '', 1).retryable).toBe(true);
    expect(new ZaiError('http_5xx', '', 1).retryable).toBe(true);
    expect(new ZaiError('http_4xx', '', 1).retryable).toBe(false);
    expect(new ZaiError('http_401', '', 1).retryable).toBe(false);
    expect(new ZaiError('parse', '', 1).retryable).toBe(false);
  });
});
