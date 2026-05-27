'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMyProfile, useUpdateRespondentProfile, useTags } from '@/hooks/use-profile';
import { TagSelector } from '@/components/forms/tag-selector';
import type { RespondentProfile, AgeRange, Gender, Occupation, Industry, Education } from '@/hooks/use-profile';
import { extractApiError } from '@/lib/extract-error';
import {
  AGE_RANGE_OPTIONS,
  GENDER_OPTIONS,
  EMPLOYMENT_OPTIONS,
  INDUSTRY_OPTIONS,
  EDUCATION_OPTIONS,
  TW_REGIONS,
} from '@/lib/profile-options';

export default function ProfileEditPage() {
  const router = useRouter();
  const { data: profile, isLoading: profileLoading, isError: profileError } = useMyProfile();
  const { data: tags = [], isLoading: tagsLoading, isError: tagsError } = useTags();
  const updateProfile = useUpdateRespondentProfile();

  const [form, setForm] = useState<{
    ageRange: AgeRange | '';
    gender: Gender | '';
    region: string;
    occupation: Occupation | '';
    industry: Industry | '';
    industryOther: string;
    education: Education | '';
    tagIds: string[];
  }>({
    ageRange: '',
    gender: '',
    region: '',
    occupation: '',
    industry: '',
    industryOther: '',
    education: '',
    tagIds: [],
  });

  // Pre-fill from existing profile
  useEffect(() => {
    const rp = profile as RespondentProfile | null;
    if (rp) {
      setForm({
        ageRange: (rp.ageRange as AgeRange) ?? '',
        gender: (rp.gender as Gender) ?? '',
        region: rp.region ?? '',
        occupation: (rp.occupation as Occupation) ?? '',
        industry: (rp.industry as Industry) ?? '',
        industryOther: rp.industryOther ?? '',
        education: (rp.education as Education) ?? '',
        tagIds: rp.tags?.map((t) => t.id) ?? [],
      });
    }
  }, [profile]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // 行業改選非「其他」時，連同清掉自由填寫
  const setIndustry = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Industry | '';
    setForm((prev) => ({
      ...prev,
      industry: value,
      industryOther: value === 'other' ? prev.industryOther : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only include non-empty values; arrays only included when non-empty (to avoid clearing tags)
    const dto = Object.fromEntries(
      Object.entries(form).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== '')),
    ) as Parameters<typeof updateProfile.mutateAsync>[0];
    try {
      await updateProfile.mutateAsync(dto);
      router.push('/profile');
    } catch {
      // error displayed via updateProfile.error below
    }
  };

  if (profileLoading) {
    return <main className="mx-auto max-w-lg px-4 py-12"><p className="text-sm text-muted-foreground">載入中…</p></main>;
  }

  if (profileError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-destructive">無法載入個人資料，請重新整理頁面。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-primary">
          ← 返回
        </button>
        <h1 className="text-2xl font-bold">編輯個人資料</h1>
      </div>
      <p className="mb-8 text-sm text-muted-foreground">
        填寫資料有助於收到更符合你的問卷。
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <SelectField label="年齡層" value={form.ageRange} onChange={set('ageRange')} options={AGE_RANGE_OPTIONS} />
        <SelectField label="性別" value={form.gender} onChange={set('gender')} options={GENDER_OPTIONS} />

        <div>
          <label className="mb-1 block text-sm font-medium">居住縣市</label>
          <select
            value={form.region}
            onChange={set('region')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">請選擇</option>
            {TW_REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <SelectField label="就業狀態" value={form.occupation} onChange={set('occupation')} options={EMPLOYMENT_OPTIONS} />

        <div>
          <SelectField label="行業 / 職業類別" value={form.industry} onChange={setIndustry} options={INDUSTRY_OPTIONS} />
          {form.industry === 'other' && (
            <input
              type="text"
              value={form.industryOther}
              onChange={(e) => setForm((prev) => ({ ...prev, industryOther: e.target.value }))}
              maxLength={50}
              placeholder="請填寫你的行業（最多 50 字）"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </div>

        <SelectField label="學歷" value={form.education} onChange={set('education')} options={EDUCATION_OPTIONS} />

        <div>
          <label className="mb-2 block text-sm font-medium">興趣標籤（最多 10 個）</label>
          {tagsLoading ? (
            <p className="text-sm text-muted-foreground">載入標籤中…</p>
          ) : tagsError ? (
            <p className="text-sm text-destructive">標籤載入失敗，請重新整理頁面。</p>
          ) : (
            <TagSelector
              tags={tags}
              selected={form.tagIds}
              onChange={(ids) => setForm((prev) => ({ ...prev, tagIds: ids }))}
            />
          )}
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
          {updateProfile.isPending ? '儲存中…' : '儲存變更'}
        </button>
      </form>
    </main>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">請選擇</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
