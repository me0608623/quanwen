'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useMe, useUpdateProfile, isPlaceholderEmail } from '@/hooks/use-auth';
import { useMyProfile } from '@/hooks/use-profile';
import { useMyResponses, useMyAppeals, useCreateAppeal, useMyReputationHistory } from '@/hooks/use-responses';
import type { RespondentProfile } from '@/hooks/use-profile';

const REPUTATION_LEVELS = [
  { min: 90, label: '優質受試者', color: 'text-green-600', bg: 'bg-green-100' },
  { min: 70, label: '良好', color: 'text-blue-600', bg: 'bg-blue-100' },
  { min: 50, label: '一般', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  { min: 0,  label: '待改進', color: 'text-orange-600', bg: 'bg-orange-100' },
] as const;

function getReputationLevel(score: number) {
  return REPUTATION_LEVELS.find((l) => score >= l.min) ?? REPUTATION_LEVELS[3];
}

const AGE_RANGE_LABELS: Record<string, string> = {
  under_18: '18 歲以下', '18_24': '18–24 歲', '25_34': '25–34 歲',
  '35_44': '35–44 歲', '45_54': '45–54 歲', '55_plus': '55 歲以上',
};
const GENDER_LABELS: Record<string, string> = {
  male: '男性', female: '女性', non_binary: '非二元', prefer_not_to_say: '不透露',
};
const OCCUPATION_LABELS: Record<string, string> = {
  student: '學生', employed_full_time: '全職', employed_part_time: '兼職',
  self_employed: '自雇', unemployed: '待業', retired: '退休', homemaker: '家管', other: '其他',
};
const EDUCATION_LABELS: Record<string, string> = {
  junior_high: '國中', senior_high: '高中/高職', vocational: '專科',
  bachelor: '學士', master: '碩士', phd: '博士', other: '其他',
};

export default function ProfilePage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: profile, isLoading, isError } = useMyProfile();
  const { data: history = [] } = useMyResponses();
  const updateProfile = useUpdateProfile();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">載入中…</div>;
  if (isError) return <div className="p-10 text-sm text-destructive">載入失敗，請重新整理頁面。</div>;

  const handleNameSave = async () => {
    if (!nameInput.trim()) return;
    try {
      await updateProfile.mutateAsync({ displayName: nameInput.trim() });
      setEditingName(false);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '儲存失敗');
    }
  };

  const hasPlaceholder = isPlaceholderEmail(me?.email);
  const rp = profile as RespondentProfile | null;
  const repScore = rp?.reputationScore ?? 60;
  const repLevel = getReputationLevel(repScore);
  const totalCompleted = rp?.totalCompleted ?? 0;
  const completionRateRaw = parseFloat(String(rp?.completionRate ?? '100'));
  const completionRate = Number.isFinite(completionRateRaw) ? completionRateRaw : 100;

  const rewardedCount = history.filter((r) => r.status === 'rewarded').length;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的個人資料</h1>
        <button
          onClick={() => router.push('/profile/edit')}
          className="text-sm text-primary hover:underline"
        >
          編輯資料
        </button>
      </div>

      {/* 使用者基本資訊 */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-4">
          {me?.avatarUrl ? (
            <Image
              src={me.avatarUrl}
              alt={me.displayName}
              width={52}
              height={52}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary ring-2 ring-border">
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
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="輸入新暱稱"
                  maxLength={100}
                />
                <button
                  onClick={handleNameSave}
                  disabled={updateProfile.isPending || !nameInput.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {updateProfile.isPending ? '儲存中…' : '儲存'}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="rounded-md border px-3 py-1.5 text-xs"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="font-medium truncate">{me?.displayName}</p>
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

        <div className="flex gap-3 pt-1">
          <Link href="/settings/security" className="text-xs text-primary hover:underline">
            帳號安全
          </Link>
          <Link href="/settings/accounts" className="text-xs text-primary hover:underline">
            帳號連結 →
          </Link>
        </div>
      </section>

      {/* 信譽分 */}
      <section className="rounded-lg border border-border p-5">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          信譽分數
        </p>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor"
                className="text-muted/30" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor"
                className="text-primary" strokeWidth="3"
                strokeDasharray={`${repScore} ${100 - repScore}`}
                strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">
              {repScore}
            </span>
          </div>
          <div>
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${repLevel.bg} ${repLevel.color}`}>
              {repLevel.label}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              每完成 10 份問卷 +1 分，保持良好作答習慣可提升分數。
            </p>
          </div>
        </div>
      </section>

      {/* 統計 */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { value: totalCompleted, label: '完成問卷' },
          { value: `${completionRate.toFixed(0)}%`, label: '完成率' },
          { value: rewardedCount, label: '已領獎勵' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      {/* 個人資料摘要 */}
      {!rp ? (
        <section className="rounded-lg border-2 border-dashed border-border p-6 text-center space-y-3">
          <p className="text-sm font-medium">尚未填寫個人資料</p>
          <p className="text-xs text-muted-foreground">填寫資料後系統能幫你媒合更適合的問卷，提升獲獎機率。</p>
          <button
            onClick={() => router.push('/profile/edit')}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            立即填寫個人資料
          </button>
        </section>
      ) : (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">基本資料</p>
            <button
              onClick={() => router.push('/profile/edit')}
              className="text-xs text-primary hover:underline"
            >
              編輯
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            {rp.ageRange && <Item label="年齡" value={AGE_RANGE_LABELS[rp.ageRange] ?? rp.ageRange} />}
            {rp.gender && <Item label="性別" value={GENDER_LABELS[rp.gender] ?? rp.gender} />}
            {rp.region && <Item label="縣市" value={rp.region} />}
            {rp.occupation && <Item label="職業" value={OCCUPATION_LABELS[rp.occupation] ?? rp.occupation} />}
            {rp.education && <Item label="學歷" value={EDUCATION_LABELS[rp.education] ?? rp.education} />}
          </div>
          {rp.tags && rp.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rp.tags.map((t) => (
                <span key={t.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 我的填答品質（Phase 3：透明化讓受試者知道亂填會被抓）*/}
      {history.length > 0 && <MyQualitySection history={history} />}

      {/* 最近填答 */}
      {history.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">最近填答</p>
          {history.slice(0, 5).map((r) => (
            <div key={r.responseId} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm">
              <span className="truncate flex-1 mr-3">{r.surveyTitle}</span>
              {r.qualityScore != null && (
                <span className={`mr-3 text-xs font-medium ${
                  r.qualityScore >= 80 ? 'text-green-600' :
                  r.qualityScore >= 50 ? 'text-amber-600' :
                  'text-red-600'
                }`}>品質 {r.qualityScore}</span>
              )}
              <span className="text-primary font-medium shrink-0">+NT${r.rewardPoints}</span>
            </div>
          ))}
          <button
            onClick={() => router.push('/tasks')}
            className="block w-full text-center text-xs text-muted-foreground hover:text-primary"
          >
            查看全部 →
          </button>
        </section>
      )}
    </main>
  );
}

function MyQualitySection({
  history,
}: {
  history: Array<{
    responseId: string;
    surveyTitle: string;
    qualityScore?: number | null;
    qualityBreakdown?: { status?: string; flags?: string[]; llmReasoning?: string | null } | null;
    suspiciousFlags?: string[] | null;
  }>;
}) {
  const { data: appeals = [] } = useMyAppeals();
  const { data: repHistory = [] } = useMyReputationHistory();
  const createAppeal = useCreateAppeal();
  const [appealTarget, setAppealTarget] = useState<{ responseId: string; surveyTitle: string } | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const appealedIds = new Set(appeals.map((a) => a.responseId));

  const submitAppeal = async () => {
    if (!appealTarget) return;
    if (appealReason.trim().length < 5) {
      alert('請輸入至少 5 字的申訴原因');
      return;
    }
    try {
      await createAppeal.mutateAsync({
        responseId: appealTarget.responseId,
        reason: appealReason.trim(),
      });
      setAppealTarget(null);
      setAppealReason('');
      alert('申訴已提交，等待管理員處理');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? '申訴提交失敗');
    }
  };

  const audited = history.filter((r) => r.qualityScore != null);
  if (audited.length === 0) return null;
  const avg = Math.round(audited.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / audited.length);
  const passed = audited.filter((r) => (r.qualityScore ?? 0) >= 80).length;
  const susp = audited.filter((r) => {
    const s = r.qualityScore ?? 0;
    return s >= 50 && s < 80;
  }).length;
  const rejected = audited.filter((r) => (r.qualityScore ?? 0) < 50).length;
  const trustLabel = avg >= 80 ? '可信任' : avg >= 60 ? '尚可' : '需注意';
  const trustColor = avg >= 80 ? 'text-green-600 bg-green-100' : avg >= 60 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';

  // 找一筆有 flags 的紀錄當範例（最近一筆被標記的）
  const flagged = audited.find((r) => (r.qualityScore ?? 100) < 80);

  return (
    <section className="rounded-xl border border-[#126b8a]/30 bg-gradient-to-br from-[#126b8a]/[0.04] to-[#8B5CF6]/[0.03] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">📊 我的填答品質</h2>
          <p className="text-[11px] text-slate-500">AI 品質審核管線給的分數，影響獎勵發放與後續媒合</p>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${trustColor}`}>
            {trustLabel}
          </span>
          <p className="mt-0.5 text-xs text-slate-500">平均 {avg} / 100</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-white p-2 border border-green-200">
          <p className="text-lg font-bold text-green-600">{passed}</p>
          <p className="text-[10px] text-slate-500">通過</p>
        </div>
        <div className="rounded bg-white p-2 border border-amber-200">
          <p className="text-lg font-bold text-amber-600">{susp}</p>
          <p className="text-[10px] text-slate-500">疑似</p>
        </div>
        <div className="rounded bg-white p-2 border border-red-200">
          <p className="text-lg font-bold text-red-600">{rejected}</p>
          <p className="text-[10px] text-slate-500">退件</p>
        </div>
      </div>

      {flagged && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-amber-700 mb-0.5">最近一筆被標記</p>
          <p className="text-xs font-medium text-slate-800 truncate">{flagged.surveyTitle}</p>
          {flagged.qualityBreakdown?.flags && flagged.qualityBreakdown.flags.length > 0 && (
            <p className="text-[11px] text-slate-600 mt-0.5">
              扣分原因：{flagged.qualityBreakdown.flags.slice(0, 2).join('、')}
            </p>
          )}
          {(flagged.qualityScore ?? 100) < 50 && (
            appealedIds.has(flagged.responseId) ? (
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                已提交申訴：{appeals.find((a) => a.responseId === flagged.responseId)?.status === 'pending'
                  ? '等待管理員處理'
                  : appeals.find((a) => a.responseId === flagged.responseId)?.status === 'approved'
                    ? '✓ 已通過'
                    : '✗ 已駁回'}
              </p>
            ) : (
              <button
                onClick={() => setAppealTarget({ responseId: flagged.responseId, surveyTitle: flagged.surveyTitle })}
                className="mt-1.5 text-[11px] font-semibold text-[#126b8a] hover:underline"
              >
                提出申訴 →
              </button>
            )
          )}
        </div>
      )}

      {/* Phase 7.2: 信譽分趨勢 mini chart */}
      {repHistory.length > 0 && <ReputationTrendBlock history={repHistory} />}

      {/* 申訴狀態歷史 */}
      {appeals.length > 0 && (
        <details className="mt-3 rounded border border-slate-200 bg-white/60 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            我的申訴紀錄（{appeals.length}）
          </summary>
          <ul className="mt-2 space-y-1.5">
            {appeals.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded bg-slate-50 px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    a.status === 'approved' ? 'bg-green-100 text-green-700' :
                    a.status === 'dismissed' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {a.status === 'approved' ? '✓ 通過' : a.status === 'dismissed' ? '✗ 駁回' : '… 待處理'}
                  </span>
                  <span className="text-slate-500">{new Date(a.createdAt).toLocaleDateString('zh-TW')}</span>
                </div>
                <p className="mt-0.5 text-slate-700 line-clamp-2">{a.reason}</p>
                {a.adminNote && (
                  <p className="mt-0.5 text-[10px] text-slate-500">管理員：{a.adminNote}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-2 text-[10px] text-slate-400">
        ⓘ 累積過多低分填答可能影響信譽分與接案資格
      </p>

      {/* 申訴對話框 */}
      {appealTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">提出申訴</h3>
            <p className="mt-1 text-xs text-slate-500 truncate">{appealTarget.surveyTitle}</p>
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="請說明為何認為此筆填答不應被退件（至少 5 字）"
              rows={4}
              maxLength={2000}
              className="mt-3 w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-[10px] text-slate-400">提交後管理員會審核，若通過會補發獎勵且信譽分 +5</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setAppealTarget(null); setAppealReason(''); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={submitAppeal}
                disabled={createAppeal.isPending || appealReason.trim().length < 5}
                className="rounded bg-[#126b8a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5d78] disabled:opacity-50"
              >
                {createAppeal.isPending ? '提交中…' : '提交申訴'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}：</span>
      <span>{value}</span>
    </div>
  );
}

/** Phase 7.2: 信譽分趨勢 mini chart（sparkline + 最近 5 筆變動）*/
function ReputationTrendBlock({
  history,
}: {
  history: Array<{ id: string; delta: number; newScore: number; reason: string; createdAt: string }>;
}) {
  // 取最近 10 筆作 sparkline（時間升序：左舊右新）
  const points = [...history].reverse().slice(-10);
  if (points.length === 0) return null;

  const width = 200;
  const height = 32;
  const max = Math.max(...points.map((p) => p.newScore), 100);
  const min = Math.min(...points.map((p) => p.newScore), 0);
  const range = Math.max(1, max - min);
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${height - ((p.newScore - min) / range) * height}`)
    .join(' ');

  const latest = points[points.length - 1];

  return (
    <div className="mt-3 rounded border border-slate-200 bg-white/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">信譽分趨勢（最近 {points.length} 次變動）</p>
          <p className="text-xs text-slate-600">最新：{latest.newScore} 分</p>
        </div>
        <svg width={width} height={height} className="text-[#126b8a]">
          <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" />
          {points.map((p, i) => (
            <circle
              key={p.id}
              cx={i * stepX}
              cy={height - ((p.newScore - min) / range) * height}
              r={2}
              fill={p.delta > 0 ? '#16a34a' : p.delta < 0 ? '#dc2626' : '#64748b'}
            />
          ))}
        </svg>
      </div>
      <ul className="space-y-0.5">
        {history.slice(0, 5).map((h) => (
          <li key={h.id} className="flex items-center justify-between text-[11px]">
            <span className="truncate flex-1 mr-2 text-slate-600">{h.reason}</span>
            <span className={`font-mono font-bold ${
              h.delta > 0 ? 'text-green-600' : h.delta < 0 ? 'text-red-600' : 'text-slate-500'
            }`}>
              {h.delta > 0 ? '+' : ''}{h.delta} → {h.newScore}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
