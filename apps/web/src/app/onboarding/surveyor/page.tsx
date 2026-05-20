'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUpdateSurveyorProfile, useMyProfile } from '@/hooks/use-profile';
import type { SurveyorProfile } from '@/hooks/use-profile';
import { useMe } from '@/hooks/use-auth';
import { extractApiError } from '@/lib/extract-error';

export default function SurveyorOnboardingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: profile } = useMyProfile();
  const updateProfile = useUpdateSurveyorProfile();

  // Redirect respondent to their onboarding page; redirect already-onboarded users away
  useEffect(() => {
    if (!me) return;
    if (me.role === 'respondent') { router.replace('/onboarding'); return; }
    if ((profile as SurveyorProfile | null)?.isOnboardingDone) {
      router.replace('/dashboard');
    }
  }, [me, profile, router]);

  const [institutionName, setInstitutionName] = useState('');
  const [researchPurpose, setResearchPurpose] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dto: { institutionName?: string; researchPurpose?: string } = {};
    if (institutionName.trim()) dto.institutionName = institutionName.trim();
    if (researchPurpose.trim()) dto.researchPurpose = researchPurpose.trim();
    try {
      await updateProfile.mutateAsync(dto);
      router.push('/dashboard');
    } catch {
      // error displayed below submit button via updateProfile.error
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">問券方資料設定</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        告訴我們你的研究背景，有助於建立受試者信任感。
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium">機構 / 單位名稱</label>
          <input
            type="text"
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            maxLength={200}
            placeholder="例：國立台灣大學資管系"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">研究目的</label>
          <textarea
            value={researchPurpose}
            onChange={(e) => setResearchPurpose(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="簡述你的研究目的，讓受試者了解資料用途…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          <p className="mt-1 text-xs text-muted-foreground text-right">
            {researchPurpose.length}/500
          </p>
        </div>

        {updateProfile.error && (
          <p className="text-sm text-destructive">
            {extractApiError(updateProfile.error, '儲存失敗，請再試一次')}
          </p>
        )}

        <button
          type="submit"
          disabled={updateProfile.isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {updateProfile.isPending ? '儲存中…' : '完成設定，開始發問卷'}
        </button>

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="block w-full text-center text-sm text-muted-foreground underline"
        >
          跳過，稍後再填
        </button>
      </form>
    </main>
  );
}
