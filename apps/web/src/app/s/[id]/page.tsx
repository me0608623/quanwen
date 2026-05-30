'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePublicLinkSurvey, useSubmitPublicResponse } from '@/hooks/use-responses';
import { SurveyRendererSurveyJS } from '@/components/survey-editor/SurveyRendererSurveyJS';

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

  if (isLoading) return <main className="p-6 text-sm">載入中…</main>;
  if (!survey) return <main className="p-6 text-sm">找不到問卷或問卷尚未發布。</main>;

  if (done || survey.alreadySubmitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{done?.flagged ? 'AI 審核中' : '已完成'}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {done?.flagged
            ? '您的開放式填答正在進行 AI 品質審核，審核完成後將發放獎勵。'
            : `填答完成。獎勵金額：NT$${survey.rewardPoints}。`}
        </p>
      </main>
    );
  }

  const handleSubmit = async (answers: Array<{ questionId: string; textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>) => {
    const result = await submit.mutateAsync({
      answers,
      startedAt: startedAtRef.current,
    });
    setDone({ flagged: result.flagged });
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{survey.title}</h1>
      {survey.description && (
        <p className="mb-6 text-sm text-muted-foreground">{survey.description}</p>
      )}
      <SurveyRendererSurveyJS
        survey={survey}
        onSubmit={handleSubmit}
        submitting={submit.isPending}
      />
    </main>
  );
}
