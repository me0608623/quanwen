export function LoadingSpinner({ label = '載入中' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label={label}>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
