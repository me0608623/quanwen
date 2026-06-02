import { describe, expect, it } from 'vitest';
import { isValidOriginList, LOCAL_WEB_ORIGIN, parseAllowedOrigins } from './web-origins';

describe('web origins deployment helpers', () => {
  it('falls back to localhost when WEB_URL is missing', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([LOCAL_WEB_ORIGIN]);
  });

  it('supports multiple origins separated by commas and whitespace', () => {
    expect(parseAllowedOrigins('https://quanwen.tw, https://quanwen.vercel.app\nhttps://preview.vercel.app'))
      .toEqual([
        'https://quanwen.tw',
        'https://quanwen.vercel.app',
        'https://preview.vercel.app',
      ]);
  });

  it('accepts a multi-origin WEB_URL list when every origin is valid', () => {
    expect(isValidOriginList('https://quanwen.tw,https://quanwen.vercel.app')).toBe(true);
  });

  it('rejects malformed origins', () => {
    expect(isValidOriginList('https://quanwen.tw,not-a-url')).toBe(false);
  });
});