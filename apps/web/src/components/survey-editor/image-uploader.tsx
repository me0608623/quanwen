'use client';

import { useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';

interface ImageUploaderProps {
  /** Current image URL (from server) */
  value?: string;
  /** Called when upload succeeds with the new URL */
  onChange: (url: string | undefined) => void;
  /** Compact mode for inline usage (question images) */
  compact?: boolean;
  /** Label text */
  label?: string;
}

export function ImageUploader({ value, onChange, compact = false, label = '圖片' }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (file.size > 5 * 1024 * 1024) {
      setError('圖片不能超過 5MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setError('僅支援 JPEG, PNG, GIF, WebP, SVG');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ success: boolean; data: { url: string } }>(
        '/upload/image',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      onChange(data.data.url);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '上傳失敗';
      setError(msg);
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [onChange]);

  const handleRemove = useCallback(() => {
    onChange(undefined);
  }, [onChange]);

  if (compact) {
    return (
      <div className="space-y-1">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        {value ? (
          <div className="relative group rounded-md overflow-hidden border border-border">
            <img
              src={resolveAssetUrl(value)}
              alt="已上傳圖片"
              className="w-full h-24 object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs text-white bg-white/20 rounded px-2 py-1 hover:bg-white/30"
              >
                換圖
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="text-xs text-white bg-red-500/60 rounded px-2 py-1 hover:bg-red-500/80"
              >
                移除
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full h-20 rounded-md border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
          >
            {uploading ? '上傳中…' : '+ 上傳圖片'}
          </button>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-border">
          <img
            src={resolveAssetUrl(value)}
            alt="封面圖片"
            className="w-full h-40 object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-sm text-white bg-white/20 rounded-md px-3 py-1.5 hover:bg-white/30"
            >
              更換圖片
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="text-sm text-white bg-red-500/60 rounded-md px-3 py-1.5 hover:bg-red-500/80"
            >
              移除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
        >
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          {uploading ? '上傳中…' : '點擊上傳圖片'}
          <span className="text-xs">支援 JPEG, PNG, GIF, WebP, SVG（最大 5MB）</span>
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
