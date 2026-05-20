'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMyProfile, useUpdateRespondentProfile, useTags } from '@/hooks/use-profile';
import { TagSelector } from '@/components/forms/tag-selector';
import type { RespondentProfile, AgeRange, Gender, Occupation, Education } from '@/hooks/use-profile';
import { extractApiError } from '@/lib/extract-error';

const AGE_RANGE_OPTIONS = [
  { value: 'under_18', label: '18 歲以下' },
  { value: '18_24',    label: '18–24 歲' },
  { value: '25_34',    label: '25–34 歲' },
  { value: '35_44',    label: '35–44 歲' },
  { value: '45_54',    label: '45–54 歲' },
  { value: '55_plus',  label: '55 歲以上' },
];
const GENDER_OPTIONS = [
  { value: 'male',              label: '男性' },
  { value: 'female',            label: '女性' },
  { value: 'non_binary',        label: '非二元性別' },
  { value: 'prefer_not_to_say', label: '不透露' },
];
const OCCUPATION_OPTIONS = [
  { value: 'student',            label: '學生' },
  { value: 'employed_full_time', label: '全職員工' },
  { value: 'employed_part_time', label: '兼職員工' },
  { value: 'self_employed',      label: '自雇/創業' },
  { value: 'unemployed',         label: '待業中' },
  { value: 'retired',            label: '退休' },
  { value: 'homemaker',          label: '家庭主婦/夫' },
  { value: 'other',              label: '其他' },
];
const EDUCATION_OPTIONS = [
  { value: 'junior_high', label: '國中' },
  { value: 'senior_high', label: '高中/高職' },
  { value: 'vocational',  label: '專科' },
  { value: 'bachelor',    label: '學士' },
  { value: 'master',      label: '碩士' },
  { value: 'phd',         label: '博士' },
  { value: 'other',       label: '其他' },
];
const TW_REGIONS = [
  '台北市','新北市','桃園市','台中市','台南市','高雄市',
  '基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣',
  '南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣',
  '台東縣','澎湖縣','金門縣','連江縣',
];

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
    education: Education | '';
    tagIds: string[];
  }>({
    ageRange: '',
    gender: '',
    region: '',
    occupation: '',
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
        education: (rp.education as Education) ?? '',
        tagIds: rp.tags?.map((t) => t.id) ?? [],
      });
    }
  }, [profile]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

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

        <SelectField label="職業" value={form.occupation} onChange={set('occupation')} options={OCCUPATION_OPTIONS} />
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
