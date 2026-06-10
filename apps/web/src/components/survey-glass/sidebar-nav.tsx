'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SurveyModel } from 'survey-core';

interface SidebarNavProps {
  model: SurveyModel | null;
}

interface DotData {
  name: string;
  answered: boolean;
  preview: string;
}

function getAnswerPreview(model: SurveyModel, questionName: string): string {
  const q = model.getQuestionByName(questionName);
  if (!q || q.isEmpty()) return '';
  try {
    const v = q.getDisplayValue(true, q.value);
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 30 ? s.slice(0, 30) + '…' : s;
  } catch {
    return '';
  }
}

export function SidebarNav({ model }: SidebarNavProps) {
  const [dots, setDots] = useState<DotData[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!model) return;
    const qs = model.getAllQuestions();
    setDots(
      qs.map((q) => ({
        name: q.name,
        answered: !q.isEmpty(),
        preview: getAnswerPreview(model, q.name),
      })),
    );
  }, [model]);

  useEffect(() => {
    if (!model) return;
    // Schedule initial sync out of the synchronous effect body to avoid cascading renders
    const timer = setTimeout(refresh, 0);
    model.onValueChanged.add(refresh);
    return () => {
      clearTimeout(timer);
      model.onValueChanged.remove(refresh);
    };
  }, [model, refresh]);

  const currentIdx = dots.findIndex((d) => !d.answered);
  const answeredCount = dots.filter((d) => d.answered).length;
  const total = dots.length;
  const pct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  const scrollTo = (name: string) => {
    if (!model) return;
    const q = model.getQuestionByName(name);
    if (q) q.focus();
  };

  if (total === 0) return null;

  return (
    <>
      {/* ===== Desktop sidebar (md+) ===== */}
      <aside
        className="glass-sidebar hidden md:flex md:flex-col md:items-center md:rounded-[20px] md:border md:border-white/15 md:p-5"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(37,99,235,0.12) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
          minWidth: 140,
          maxWidth: 170,
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 24,
        }}
      >
        {/* Progress header */}
        <div className="mb-2 text-center">
          <div className="text-[11px] font-medium tracking-wide text-blue-300">
            作答進度
          </div>
          <div className="mt-0.5 text-lg font-bold text-white">
            {answeredCount}
            <span className="text-sm font-normal text-gray-400">/{total}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-5 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
              boxShadow: '0 0 10px rgba(37,99,235,0.5)',
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
            }}
          />
        </div>

        {/* Question dots */}
        <div className="flex flex-col items-center gap-3">
          {dots.map((d, i) => {
            const isCurrent = i === currentIdx;
            return (
              <button
                key={d.name}
                onClick={() => scrollTo(d.name)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className="relative flex items-center justify-center p-0.5"
                aria-label={`第 ${i + 1} 題${d.answered ? '（已作答）' : ''}`}
              >
                <span
                  className={`block rounded-full border-2 transition-all duration-300 ${
                    isCurrent
                      ? 'h-3.5 w-3.5 border-white bg-white'
                      : d.answered
                        ? 'h-2.5 w-2.5 border-blue-400 bg-blue-600'
                        : 'h-2.5 w-2.5 border-white/30 bg-transparent'
                  }`}
                  style={
                    isCurrent
                      ? { boxShadow: '0 0 20px rgba(255,255,255,0.6)', transform: 'scale(1.4)' }
                      : d.answered
                        ? { boxShadow: '0 0 8px rgba(37,99,235,0.6)' }
                        : undefined
                  }
                />
                {/* Tooltip on hover */}
                {hovered === i && (
                  <span
                    className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-left pointer-events-none z-50"
                    style={{
                      background:
                        'linear-gradient(145deg, rgba(7,24,61,0.96), rgba(0,26,51,0.96))',
                      backdropFilter: 'blur(12px)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    }}
                  >
                    <span className="block text-[11px] font-semibold text-white">
                      第 {i + 1} 題
                    </span>
                    <span
                      className={`block text-[11px] ${d.answered ? 'text-blue-200' : 'text-gray-400'}`}
                    >
                      {d.answered ? d.preview : '尚未作答'}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-5 space-y-1.5 text-[10px]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-blue-400 bg-blue-600" />
            <span className="text-gray-400">已答</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-white bg-white" />
            <span className="text-gray-400">當前</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-white/30 bg-transparent" />
            <span className="text-gray-400">未答</span>
          </div>
        </div>
      </aside>

      {/* ===== Mobile bottom bar ===== */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 overflow-x-auto px-4 py-3 md:hidden"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(37,99,235,0.12))',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <span className="shrink-0 text-[11px] font-semibold text-blue-300">
          {answeredCount}/{total}
        </span>
        <div className="h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
            }}
          />
        </div>
        {dots.map((d, i) => {
          const isCurrent = i === currentIdx;
          return (
            <button
              key={d.name}
              onClick={() => scrollTo(d.name)}
              className="shrink-0 p-0.5"
              style={{ scrollSnapAlign: 'center' }}
              aria-label={`第 ${i + 1} 題`}
            >
              <span
                className={`block rounded-full border-2 transition-all duration-300 ${
                  isCurrent
                    ? 'h-3 w-3 border-white bg-white'
                    : d.answered
                      ? 'h-2 w-2 border-blue-400 bg-blue-600'
                      : 'h-2 w-2 border-white/30 bg-transparent'
                }`}
                style={
                  isCurrent
                    ? { boxShadow: '0 0 14px rgba(255,255,255,0.6)' }
                    : d.answered
                      ? { boxShadow: '0 0 6px rgba(37,99,235,0.5)' }
                      : undefined
                }
              />
            </button>
          );
        })}
      </div>
    </>
  );
}
