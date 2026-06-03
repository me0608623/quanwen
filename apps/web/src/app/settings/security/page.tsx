'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMe, useSecurityInfo, useChangeEmail, useSetPassword, useChangePassword, useSendVerificationEmail } from '@/hooks/use-auth';
import { extractApiError } from '@/lib/extract-error';
import { passwordStrength } from '@/lib/password-strength';

function SectionCard({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="fixed top-4 right-4 z-50 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg cursor-pointer"
      onClick={onClose}
    >
      {message}
    </div>
  );
}

export default function SecurityPage() {
  const { data: me } = useMe();
  const { data: security, isLoading, refetch } = useSecurityInfo();
  const changeEmail = useChangeEmail();
  const setPassword = useSetPassword();
  const changePassword = useChangePassword();
  const sendVerification = useSendVerificationEmail();

  const [emailInput, setEmailInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const isPlaceholderEmail =
    me?.email?.endsWith('@line.placeholder') || me?.email?.endsWith('@apple.placeholder');

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await changeEmail.mutateAsync(emailInput);
      showToast(result.message ?? '電子郵件已更新');
      setEmailInput('');
      refetch();
    } catch (err) {
      showToast(extractApiError(err, '更新失敗'));
    }
  };

  const pwTooShort = newPassword.length > 0 && newPassword.length < 8;
  const pwNoUppercase = newPassword.length > 0 && !/[A-Z]/.test(newPassword);
  const pwNoDigit = newPassword.length > 0 && !/[0-9]/.test(newPassword);
  const pwInvalid = !newPassword || newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('兩次密碼不一致');
      return;
    }
    if (pwInvalid) return;
    try {
      const result = await setPassword.mutateAsync(newPassword);
      showToast(result.message);
      setNewPassword('');
      setConfirmPassword('');
      refetch();
    } catch (err) {
      showToast(extractApiError(err, '設定失敗'));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('兩次密碼不一致');
      return;
    }
    if (pwInvalid) return;
    try {
      const result = await changePassword.mutateAsync({ currentPassword, newPassword });
      showToast(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      refetch();
    } catch (err) {
      showToast(extractApiError(err, '更改失敗'));
    }
  };

  if (isLoading) return <div className="py-10 text-sm text-muted-foreground">載入中...</div>;

  return (
    <main className="space-y-6">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <h1 className="text-xl font-bold">帳號安全</h1>

      {/* Email not verified warning */}
      {me && !me.emailVerified && !isPlaceholderEmail && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start justify-between gap-4">
          <p>你的電子郵件尚未驗證。請檢查收件匣並點擊驗證連結，確保帳號安全。</p>
          <button
            type="button"
            disabled={sendVerification.isPending || sendVerification.isSuccess}
            onClick={() =>
              sendVerification.mutate(undefined, {
                onSuccess: () => showToast('驗證信已發送，請在 24 小時內點擊連結'),
                onError: () => showToast('發送失敗，請稍後再試'),
              })
            }
            className="shrink-0 text-xs font-medium underline hover:no-underline disabled:opacity-50"
          >
            {sendVerification.isSuccess ? '已發送' : sendVerification.isPending ? '發送中…' : '重新發送'}
          </button>
        </div>
      )}

      {/* Email section */}
      <SectionCard
        title="電子郵件"
        description={
          isPlaceholderEmail
            ? '你目前使用的是第三方登入，尚未設定電子郵件。設定後可用電子郵件登入。'
            : '更改登入用電子郵件地址。'
        }
      >
        <div className="text-sm">
          目前：
          <span className={`ml-1 font-medium ${isPlaceholderEmail ? 'text-destructive' : ''}`}>
            {isPlaceholderEmail ? '（未設定）' : me?.email}
          </span>
        </div>

        <form onSubmit={handleChangeEmail} className="space-y-3">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={isPlaceholderEmail ? '輸入你的電子郵件' : '輸入新的電子郵件'}
            aria-label="電子郵件"
            required
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={changeEmail.isPending || !emailInput}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {changeEmail.isPending ? '更新中...' : isPlaceholderEmail ? '設定電子郵件' : '更改電子郵件'}
          </button>
        </form>
      </SectionCard>

      {/* Password section */}
      {security?.hasPassword ? (
        <SectionCard
          title="更改密碼"
          description="定期更改密碼以保護帳號安全。"
        >
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">目前密碼</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="輸入目前密碼"
                aria-label="目前密碼"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="至少 8 碼，含大寫字母及數字"
                minLength={8}
                aria-label="新密碼"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {pwTooShort && <p className="mt-1 text-xs text-destructive">密碼至少 8 個字元</p>}
              {!pwTooShort && pwNoUppercase && <p className="mt-1 text-xs text-destructive">需包含至少一個大寫字母</p>}
              {!pwTooShort && !pwNoUppercase && pwNoDigit && <p className="mt-1 text-xs text-destructive">需包含至少一個數字</p>}
              {newPassword.length > 0 && (() => {
                const st = passwordStrength(newPassword);
                const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'];
                return (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-1 flex-1 rounded-full ${i <= st.score - 1 ? colors[st.score] : 'bg-muted'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">強度：{st.label}</p>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">確認新密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="再輸入一次"
                aria-label="確認新密碼"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={changePassword.isPending || pwInvalid}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {changePassword.isPending ? '更改中...' : '更改密碼'}
            </button>
            <p className="text-xs text-muted-foreground">
              忘記目前密碼？
              <Link href="/auth/forgot-password" className="ml-1 text-primary underline">
                重設密碼
              </Link>
            </p>
          </form>
        </SectionCard>
      ) : (
        <SectionCard
          title="設定密碼"
          description="你目前只能用第三方登入。設定密碼後，可以用電子郵件 + 密碼登入。"
        >
          {isPlaceholderEmail && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">
              請先設定電子郵件，才能設定密碼登入。
            </p>
          )}
          <form onSubmit={handleSetPassword} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="至少 8 碼，含大寫字母及數字"
                minLength={8}
                disabled={isPlaceholderEmail || setPassword.isPending}
                aria-label="新密碼"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              {pwTooShort && <p className="mt-1 text-xs text-destructive">密碼至少 8 個字元</p>}
              {!pwTooShort && pwNoUppercase && <p className="mt-1 text-xs text-destructive">需包含至少一個大寫字母</p>}
              {!pwTooShort && !pwNoUppercase && pwNoDigit && <p className="mt-1 text-xs text-destructive">需包含至少一個數字</p>}
              {newPassword.length > 0 && (() => {
                const st = passwordStrength(newPassword);
                const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-emerald-500'];
                return (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-1 flex-1 rounded-full ${i <= st.score - 1 ? colors[st.score] : 'bg-muted'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">強度：{st.label}</p>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">確認密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="再輸入一次"
                disabled={isPlaceholderEmail || setPassword.isPending}
                aria-label="確認密碼"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={setPassword.isPending || isPlaceholderEmail || pwInvalid}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {setPassword.isPending ? '設定中...' : '設定密碼'}
            </button>
          </form>
        </SectionCard>
      )}

      {/* Danger zone */}
      <SectionCard title="登入方式摘要">
        <div className="text-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${security?.hasPassword ? 'bg-green-500' : 'bg-muted'}`} />
            <span className={security?.hasPassword ? '' : 'text-muted-foreground'}>
              電子郵件 / 密碼{security?.hasPassword ? ' ✓' : ' （未設定）'}
            </span>
          </div>
          {security?.linkedProviders.map((p) => (
            <div key={p.provider} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span>{p.provider.charAt(0).toUpperCase() + p.provider.slice(1)} ✓</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </main>
  );
}
