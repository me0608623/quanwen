'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMe, useUpdateProfile, isPlaceholderEmail } from '@/hooks/use-auth';
import { useMyProfile, useUpdateSurveyorProfile } from '@/hooks/use-profile';
import type { SurveyorProfile } from '@/hooks/use-profile';
import { extractApiError } from '@/lib/extract-error';

export default function SurveyorProfilePage() {
  const { data: me } = useMe();
  const { data: profile, isLoading, isError } = useMyProfile();
  const updateUser = useUpdateProfile();
  const updateSurveyor = useUpdateSurveyorProfile();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [researchPurpose, setResearchPurpose] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Populate form once profile loads
  useEffect(() => {
    if (profile) {
      const sp = profile as SurveyorProfile;
      setInstitutionName(sp.institutionName ?? '');
      setResearchPurpose(sp.researchPurpose ?? '');
    }
  }, [profile]);

  const handleNameSave = async () => {
    if (!nameInput.trim()) return;
    try {
      await updateUser.mutateAsync({ displayName: nameInput.trim() });
      setEditingName(false);
      showToast('暱稱已更新');
    } catch {
      showToast('更新失敗，請再試一次');
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const dto: { institutionName?: string; researchPurpose?: string } = {};
    if (institutionName.trim()) dto.institutionName = institutionName.trim();
    if (researchPurpose.trim()) dto.researchPurpose = researchPurpose.trim();
    try {
      await updateSurveyor.mutateAsync(dto);
      showToast('個人資料已儲存');
    } catch (err) {
      showToast(extractApiError(err, '儲存失敗，請再試一次'));
    }
  };

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">載入中…</div>;
  if (isError) return <div className="p-10 text-sm text-destructive">載入失敗，請重新整理頁面。</div>;

  const sp = profile as SurveyorProfile | null;
  const hasPlaceholder = isPlaceholderEmail(me?.email);

  return (
    <main className="max-w-lg space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">問券方資料</h1>
        <Link href="/settings/accounts" className="text-sm text-primary hover:underline">
          帳號設定 →
        </Link>
      </div>

      {/* Avatar + basic info */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-4">
          {me?.avatarUrl ? (
            <Image
              src={me.avatarUrl}
              alt={me.displayName}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary ring-2 ring-border">
              {me?.displayName?.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="flex-1 rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  maxLength={100}
                />
                <button
                  onClick={handleNameSave}
                  disabled={updateUser.isPending}
                  className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  儲存
                </button>
                <button onClick={() => setEditingName(false)} className="rounded-md border px-2 py-1 text-xs">
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="font-semibold truncate">{me?.displayName}</p>
                <button
                  onClick={() => { setNameInput(me?.displayName ?? ''); setEditingName(true); }}
                  className="text-xs text-muted-foreground hover:text-primary shrink-0"
                >
                  編輯
                </button>
              </div>
            )}
            <p className={`text-sm truncate ${hasPlaceholder ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {hasPlaceholder ? '⚠ 尚未設定電子郵件' : me?.email}
            </p>
            {hasPlaceholder && (
              <Link href="/settings/security" className="text-xs text-amber-600 underline">
                前往設定 →
              </Link>
            )}
          </div>
        </div>

        {sp && (
          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${sp.isVerified ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
              {sp.isVerified ? '已驗證機構' : '未驗證'}
            </span>
          </div>
        )}
      </section>

      {/* Profile form */}
      <section className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">研究背景</h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">機構 / 單位名稱</label>
            <input
              type="text"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              maxLength={200}
              placeholder="例：國立台灣大學資管系"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">研究目的</label>
            <textarea
              value={researchPurpose}
              onChange={(e) => setResearchPurpose(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="簡述你的研究目的，讓受試者了解資料用途…"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">{researchPurpose.length}/500</p>
          </div>

          <button
            type="submit"
            disabled={updateSurveyor.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateSurveyor.isPending ? '儲存中…' : '儲存資料'}
          </button>
        </form>
      </section>

      {/* Quick links */}
      <section className="flex gap-3 flex-wrap">
        <Link
          href="/settings/security"
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          帳號安全
        </Link>
        <Link
          href="/settings/accounts"
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          帳號連結
        </Link>
      </section>
    </main>
  );
}
