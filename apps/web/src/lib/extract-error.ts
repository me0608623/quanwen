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
  if (Array.isArray(nested) && nested.length > 0) {
    const first = nested.find((m) => typeof m === 'string' && m.trim());
    if (typeof first === 'string') return first;
  }
  const flat = data?.message;
  if (typeof flat === 'string' && flat) return flat;
  if (Array.isArray(flat) && flat.length > 0) {
    const first = flat.find((m) => typeof m === 'string' && m.trim());
    if (typeof first === 'string') return first;
  }
  return fallback;
}

/**
 * Respondent-facing submit error copy: prefer API anti-cheat / quality messages,
 * with status-aware Traditional Chinese fallbacks.
 */
export function extractSubmitError(
  err: unknown,
  fallback = '提交失敗，請稍後再試',
): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const backendMsg = extractApiError(err, '');
  if (status === 409) return backendMsg || '這份問卷你已經填過了';
  if (status === 401) return backendMsg || '請重新登入後再試';
  if (status === 403) return backendMsg || '目前無法填寫此問卷（權限不足或未符合受眾條件）';
  if (status === 400 || status === 422) return backendMsg || '送出資料有誤，請檢查後重試';
  if (status === 429) return backendMsg || '操作過於頻繁，請稍後再試';
  return backendMsg || fallback;
}
