'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMe, useLinkedProviders, useUnbindProvider } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { extractApiError } from '@/lib/extract-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

interface ProviderConfig {
  key: 'google' | 'line' | 'apple';
  label: string;
  color: string;
  icon: React.ReactNode;
  bindUrl: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    key: 'google',
    label: 'Google',
    color: 'text-blue-600',
    bindUrl: `${API_URL}/auth/bind/google`,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
  },
  {
    key: 'line',
    label: 'LINE',
    color: 'text-green-600',
    bindUrl: `${API_URL}/auth/bind/line`,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#06C755">
        <path d="M19.952 10.489C19.952 6.336 15.8 3 10.668 3S1.384 6.336 1.384 10.489c0 3.722 3.3 6.84 7.757 7.432.302.065.714.2.818.458.093.235.061.603.03.84l-.132.795c-.04.235-.186.92.807.502 1.001-.42 5.395-3.177 7.363-5.44 1.358-1.49 2.009-3.002 1.925-4.587z"/>
      </svg>
    ),
  },
  {
    key: 'apple',
    label: 'Apple',
    color: 'text-foreground',
    bindUrl: `${API_URL}/auth/bind/apple`,
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.36c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.03zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    ),
  },
];

function AccountsContent() {
  const searchParams = useSearchParams();
  const { data: me } = useMe();
  const { data: linked = [], isLoading, refetch } = useLinkedProviders();
  const unbind = useUnbindProvider();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const bound = searchParams.get('bound');
    const error = searchParams.get('error');
    if (bound) {
      setToast({ message: `已成功綁定 ${bound.toUpperCase()}`, type: 'success' });
      refetch();
    } else if (error === 'bind_expired') {
      setToast({ message: '綁定連結已過期，請重新點擊「綁定」按鈕', type: 'error' });
    } else if (error === 'already_bound') {
      setToast({ message: '此第三方帳號已被其他帳號綁定，無法重複綁定', type: 'error' });
    }
    if (bound || error) setTimeout(() => setToast(null), 4000);
  }, [searchParams, refetch]);

  const linkedSet = new Set(linked.map((l) => l.provider));

  const OAUTH_ALLOWED_HOSTS = new Set(['accounts.google.com', 'access.line.me', 'appleid.apple.com']);

  const handleBind = async (bindUrl: string) => {
    try {
      const { data } = await api.get<{ redirectUrl: string }>(bindUrl);
      // Validate redirect stays on known OAuth provider domains
      try {
        const { hostname } = new URL(data.redirectUrl);
        if (!OAUTH_ALLOWED_HOSTS.has(hostname)) {
          throw new Error(`unexpected redirect host: ${hostname}`);
        }
      } catch {
        setToast({ message: '綁定啟動失敗：非預期的重導目標', type: 'error' });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setToast({ message: '綁定啟動失敗，請重試', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleUnbind = async (provider: string) => {
    if (!confirm(`確定要解除 ${provider.toUpperCase()} 綁定嗎？`)) return;
    try {
      await unbind.mutateAsync(provider);
      setToast({ message: `已解除 ${provider.toUpperCase()} 綁定`, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setToast({ message: extractApiError(e, '解除失敗'), type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <main className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-md px-4 py-2 text-sm shadow-lg ${
          toast.type === 'error'
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground'
        }`}>
          {toast.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">帳號連結</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理你的第三方登入方式，連結後可使用該服務直接登入。
        </p>
      </div>

      {/* Account info */}
      <section className="rounded-lg border border-border p-4 space-y-1">
        <p className="text-sm font-medium">{me?.displayName}</p>
        <p className="text-xs text-muted-foreground">{me?.email}</p>
      </section>

      {/* Providers */}
      <section className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">載入中...</p>
        ) : (
          PROVIDERS.map((p) => {
            const isLinked = linkedSet.has(p.key);
            const linkedInfo = linked.find((l) => l.provider === p.key);

            return (
              <div
                key={p.key}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {p.icon}
                  <div>
                    <p className="text-sm font-medium">{p.label}</p>
                    {isLinked && linkedInfo && (
                      <>
                        {linkedInfo.providerEmail && (
                          <p className="text-xs text-muted-foreground">{linkedInfo.providerEmail}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          已連結於 {new Date(linkedInfo.linkedAt).toLocaleDateString('zh-TW')}
                        </p>
                      </>
                    )}
                    {!isLinked && (
                      <p className="text-xs text-muted-foreground">未連結</p>
                    )}
                  </div>
                </div>

                {isLinked ? (
                  <button
                    onClick={() => handleUnbind(p.key)}
                    disabled={unbind.isPending}
                    className="rounded-md border border-destructive px-3 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    解除綁定
                  </button>
                ) : (
                  <button
                    onClick={() => handleBind(p.bindUrl)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    綁定
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        ※ 解除綁定需確保帳號有其他登入方式（電子郵件密碼或其他第三方連結）。
      </p>
    </main>
  );
}

export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">載入中...</p>
        </div>
      }
    >
      <AccountsContent />
    </Suspense>
  );
}
