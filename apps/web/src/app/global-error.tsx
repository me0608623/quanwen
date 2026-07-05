'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <div>
          <p style={{ fontSize: '3rem', margin: 0 }}>😵</p>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '0.75rem' }}>系統發生嚴重錯誤</h1>
          <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            請重試，或稍後再回來。
          </p>
          {/* Debug info — show actual error so we can diagnose */}
          {error?.message && (
            <pre
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#f5f5f5',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                color: '#d00',
                maxWidth: '90vw',
                overflow: 'auto',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error.message}
              {error.digest ? `\n[digest: ${error.digest}]` : ''}
            </pre>
          )}
        </div>
        <button
          onClick={() => reset()}
          style={{
            background: '#126b8a',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            padding: '0.5rem 1.25rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          重試
        </button>
      </body>
    </html>
  );
}
