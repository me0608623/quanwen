'use client';

import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnswerInput, PublicQuestion, usePublicLinkSurvey, useSubmitPublicResponse } from '@/hooks/use-responses';

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

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
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

  const q = survey.questions[idx];
  const progress = ((idx + 1) / survey.questions.length) * 100;
  const current = answers[q.id];

  const onNext = async () => {
    if (idx < survey.questions.length - 1) {
      setIdx((v) => v + 1);
      return;
    }
    const result = await submit.mutateAsync({
      answers: Object.values(answers),
      startedAt: startedAtRef.current,
    });
    setDone({ flagged: result.flagged });
  };

  const canProceed =
    !q.isRequired || !!current?.textAnswer || !!current?.ratingValue || !!current?.selectedOptionIds?.length;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">{survey.title}</h1>
      <div className="mt-4 h-2 rounded bg-slate-100">
        <div className="h-2 rounded bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Question {idx + 1} / {survey.questions.length}
      </p>
      <Question
        question={q}
        answer={current}
        onChange={(patch) =>
          setAnswers((prev) => ({
            ...prev,
            [q.id]: { ...prev[q.id], ...patch, questionId: q.id },
          }))
        }
      />
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          className="rounded border px-4 py-2 text-sm"
          onClick={() => setIdx((v) => Math.max(0, v - 1))}
          disabled={idx === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          onClick={onNext}
          disabled={!canProceed || submit.isPending}
        >
          {idx === survey.questions.length - 1 ? 'Submit' : 'Next'}
        </button>
      </div>
    </main>
  );
}

function Question({
  question,
  answer,
  onChange,
}: {
  question: PublicQuestion;
  answer?: AnswerInput;
  onChange: (patch: Partial<AnswerInput>) => void;
}) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold">{question.title}</h2>
      {question.type === 'text' && (
        <textarea
          className="mt-3 w-full rounded border px-3 py-2 text-sm"
          rows={4}
          value={answer?.textAnswer ?? ''}
          onChange={(e) => onChange({ textAnswer: e.target.value })}
        />
      )}
      {question.type === 'rating' && (
        <input
          className="mt-3 w-full"
          type="range"
          min={1}
          max={10}
          value={answer?.ratingValue ?? 5}
          onChange={(e) => onChange({ ratingValue: Number(e.target.value) })}
        />
      )}
      {question.type === 'single_choice' && (
        <div className="mt-3 space-y-2">
          {question.options.map((opt) => (
            <label key={opt.id} className="block text-sm">
              <input
                className="mr-2"
                type="radio"
                checked={answer?.selectedOptionIds?.[0] === opt.id}
                onChange={() => onChange({ selectedOptionIds: [opt.id] })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {question.type === 'multiple_choice' && (
        <div className="mt-3 space-y-2">
          {question.options.map((opt) => {
            const checked = answer?.selectedOptionIds?.includes(opt.id) ?? false;
            const ids = answer?.selectedOptionIds ?? [];
            return (
              <label key={opt.id} className="block text-sm">
                <input
                  className="mr-2"
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    onChange({
                      selectedOptionIds: e.target.checked ? [...ids, opt.id] : ids.filter((id) => id !== opt.id),
                    })
                  }
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
