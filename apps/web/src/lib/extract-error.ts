/**
 * Extracts a user-facing message from an API error response.
 * Covers Axios response errors (err.response.data.message) and falls back to the
 * provided fallback string when the structure doesn't match.
 */
export function extractApiError(err: unknown, fallback = '操作失敗，請再試一次'): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}
