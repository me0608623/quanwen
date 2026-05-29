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

  if (isLoading) return <main className="p-6 text-sm">Loading...</main>;
  if (!survey) return <main className="p-6 text-sm">Survey not found or unpublished.</main>;

  if (done || survey.alreadySubmitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{done?.flagged ? 'Pending Review' : 'Completed'}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {done?.flagged
            ? 'Your open-text answer is under AI review. Reward is pending until review completes.'
            : `Submission complete. Voucher reward: NT$${survey.rewardPoints}.`}
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
