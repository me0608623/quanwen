const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return `${API_ORIGIN}/${url}`;
}
