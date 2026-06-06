/**
 * Extracts a user-facing message from an API error response.
 * Covers Axios response errors (err.response.data.message) and falls back to the
 * provided fallback string when the structure doesn't match.
 */
export function extractApiError(err: unknown, fallback = '操作失敗，請再試一次'): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    | { message?: unknown; error?: { message?: unknown } }
    | undefined;
  // 巢狀 {error: {code, message}} 格式（如匯入端點）優先，再退到平面 message
  const nested = data?.error?.message;
  if (typeof nested === 'string' && nested) return nested;
  const flat = data?.message;
  if (typeof flat === 'string' && flat) return flat;
  return fallback;
}
