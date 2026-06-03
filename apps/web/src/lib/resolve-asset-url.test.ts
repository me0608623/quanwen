import { describe, it, expect } from 'vitest';
import { resolveAssetUrl } from './resolve-asset-url';

describe('resolveAssetUrl', () => {
  it('returns undefined for null/empty input', () => {
    expect(resolveAssetUrl(null)).toBeUndefined();
    expect(resolveAssetUrl(undefined)).toBeUndefined();
    expect(resolveAssetUrl('')).toBeUndefined();
  });

  it('passes through absolute http(s) URLs unchanged', () => {
    expect(resolveAssetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(resolveAssetUrl('http://x.test/b.jpg')).toBe('http://x.test/b.jpg');
  });

  it('prefixes the API origin for root-relative paths', () => {
    const out = resolveAssetUrl('/uploads/x.png');
    expect(out).toMatch(/\/uploads\/x\.png$/);
    expect(out).not.toMatch(/\/api\/v1/);
  });

  it('prefixes the API origin with a slash for bare relative paths', () => {
    const out = resolveAssetUrl('uploads/y.png');
    expect(out).toMatch(/\/uploads\/y\.png$/);
  });
});
