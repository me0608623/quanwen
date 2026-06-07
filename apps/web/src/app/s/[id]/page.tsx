'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePublicLinkSurvey, useSubmitPublicResponse } from '@/hooks/use-responses';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';
import { lotteryDisclosure } from '@/lib/lottery-display';
import { estimateFillMinutes } from '@/lib/fill-time';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { resolveAssetUrl } from '@/lib/resolve-asset-url';

const ANON_KEY = 'quanwen_anon_token_v1';

function getAnonToken() {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(ANON_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(ANON_KEY, token);
  }
  return token;
}

export default function PublicSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const anonToken = useMemo(() => getAnonToken(), []);
  const startedAtRef = useRef<string>(new Date().toISOString());
  const { data: survey, isLoading } = usePublicLinkSurvey(id);
  const submit = useSubmitPublicResponse(id, anonToken);

  const [done, setDone] = useState<{ flagged: boolean } | null>(null);

  if (isLoading) return <main className="p-6"><LoadingSpinner /></main>;
  if (!survey)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h1 className="text-lg font-bold">找不到這份問卷</h1>
        <p className="mt-2 text-sm text-muted-foreground">問卷可能已下架、截止，或連結有誤。</p>
        <Link
          href="/auth/register"
          className="mt-6 inline-block rounded-md bg-[#126b8a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0f5d78]"
        >
          免費註冊券問，填問卷賺獎勵 →
        </Link>
      </main>
    );
  if (survey.rewardMode === 'lottery') {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          這份問卷提供「{survey.lotteryPrize}」抽獎回饋。請登入後填答，系統才能在開獎後通知你是否中獎。
        </p>
        <p className="mt-2 text-sm font-semibold text-amber-800">抽獎規則：{lotteryDisclosure(survey)}</p>
        <Link href={`/auth/login?redirect=${encodeURIComponent(`/tasks/${id}`)}`} className="mt-6 inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
          登入後參與抽獎
        </Link>
      </main>
    );
  }

  if (done || survey.alreadySubmitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{done ? (done.flagged ? 'AI 審核中' : '填答已送出') : '已完成'}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {done
            ? '您的填答正在進行品質審核，審核通過後將發放獎勵。'
            : `填答完成。獎勵金額：NT$${survey.rewardPoints}。`}
        </p>
        {/* 建立者自訂的感謝頁內容（結束設定） */}
        {done && survey.thankYouMessage && (
          <p className="mx-auto mt-4 max-w-md whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {survey.thankYouMessage}
          </p>
        )}
        {done && (survey.thankYouImages?.length ?? 0) > 0 && (
          <div className="mx-auto mt-4 max-w-md space-y-3">
            {survey.thankYouImages!.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={resolveAssetUrl(url)}
                alt={`感謝頁圖片 ${i + 1}`}
                className="w-full rounded-xl object-contain"
              />
            ))}
          </div>
        )}
        {done && survey.thankYouRedirectUrl && (
          <a
            href={survey.thankYouRedirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-md border border-[#126b8a] px-5 py-2 text-sm font-semibold text-[#126b8a] hover:bg-[#126b8a]/5"
          >
            前往指定頁面 ↗
          </a>
        )}
        <div className="mt-6 rounded-xl border border-[#126b8a]/20 bg-[#126b8a]/5 p-4">
          <p className="text-sm font-medium text-[#126b8a]">想填更多問卷賺獎勵，或自己發問卷找受試者？</p>
          <Link
            href="/auth/register"
            className="mt-3 inline-block rounded-md bg-[#126b8a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0f5d78]"
          >
            免費註冊券問 →
          </Link>
        </div>
      </main>
    );
  }

  const handleSubmit = async (answers: Array<{ questionId: string; textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>) => {
    try {
      const result = await submit.mutateAsync({
        answers,
        startedAt: startedAtRef.current,
      });
      setDone({ flagged: result.flagged });
    } catch {
      // 錯誤透過 submit.error 顯示於下方，避免未處理的 rejection 卡住表單
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      {survey.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveAssetUrl(survey.coverImageUrl)}
          alt=""
          className="mb-4 max-h-60 w-full rounded-xl object-cover"
        />
      )}
      <h1 className="mb-2 text-2xl font-bold">{survey.title}</h1>
      {survey.description && (
        <p className="mb-2 text-sm text-muted-foreground">{survey.description}</p>
      )}
      {survey.welcomeImages && survey.welcomeImages.length > 0 && (
        <div className="mb-3 space-y-3">
          {survey.welcomeImages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${i}`}
              src={resolveAssetUrl(url)}
              alt={`歡迎圖 ${i + 1}`}
              className="w-full rounded-xl object-contain"
            />
          ))}
        </div>
      )}
      <p className="mb-6 text-xs text-muted-foreground">
        {survey.questions.length} 題
        {survey.questions.length > 0 && ` · 預估約 ${estimateFillMinutes(survey.questions.length)} 分鐘`}
      </p>
      {submit.error && (() => {
        const err = submit.error as { response?: { data?: { message?: string }; status?: number }; message?: string };
        const status = err?.response?.status;
        const backendMsg = err?.response?.data?.message;
        return (
          <p className="mb-4 text-sm text-destructive">
            {status === 409 ? '⚠️ 這份問卷你已經填過了'
              : status === 400 ? '⚠️ ' + (backendMsg ?? '送出資料有誤，請檢查後重試')
              : '提交失敗：' + (backendMsg ?? err?.message ?? '請稍後再試')}
          </p>
        );
      })()}
      <SurveyRendererSurveyJS
        survey={survey}
        onSubmit={handleSubmit}
        submitting={submit.isPending}
      />
    </main>
  );
}
