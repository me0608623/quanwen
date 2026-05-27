import { cn } from "@/lib/utils";

/**
 * 純 CSS 載入轉圈(無外部依賴)。
 * 用 `currentColor` 取色,可直接放進任何按鈕/文字中,顏色自動跟隨。
 * size 預設 1em,放在文字旁會自動對齊字高。
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="載入中"
      className={cn(
        "inline-block h-[1em] w-[1em] shrink-0 animate-spin rounded-full",
        "border-2 border-current border-r-transparent align-[-0.125em]",
        className,
      )}
    />
  );
}
