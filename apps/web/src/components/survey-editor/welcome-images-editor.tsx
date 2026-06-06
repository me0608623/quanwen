'use client';

import { ImageUploader } from './image-uploader';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';

interface WelcomeImagesEditorProps {
  /** 目前的圖片 URL 陣列（依顯示順序） */
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  disabled?: boolean;
}

/**
 * 歡迎頁多圖編輯器：作答者第一頁可插入多張圖片，依陣列順序顯示於描述之後。
 * 新增走既有 ImageUploader（POST /upload/image）；支援上移/下移排序與移除。
 */
export function WelcomeImagesEditor({ value, onChange, max = 12, disabled = false }: WelcomeImagesEditorProps) {
  const imgs = value ?? [];

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    const next = [...imgs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(imgs.filter((_, k) => k !== i));
  const add = (url: string | undefined) => {
    if (url) onChange([...imgs, url]);
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">
        歡迎頁圖片（作答第一頁，依序顯示於描述之後）
      </span>

      {imgs.length > 0 && (
        <ul className="space-y-2">
          {imgs.map((url, i) => (
            <li
              key={`${url}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border bg-white p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAssetUrl(url)}
                alt={`歡迎圖 ${i + 1}`}
                className="h-12 w-12 flex-shrink-0 rounded object-cover"
              />
              <span className="flex-1 truncate text-xs text-muted-foreground">{url}</span>
              {!disabled && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="上移"
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === imgs.length - 1}
                    aria-label="下移"
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label="移除"
                    className="rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && imgs.length < max && (
        <ImageUploader
          // key 隨數量變動 → 每次新增後 uploader 重置為空白，可連續加圖
          key={`welcome-add-${imgs.length}`}
          value={undefined}
          onChange={add}
          compact
          label={`新增歡迎圖（${imgs.length}/${max}）`}
        />
      )}
    </div>
  );
}
