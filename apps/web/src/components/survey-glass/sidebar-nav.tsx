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
  // Track by question name instead of DOM index to survive DOM/model order mismatch
  const [currentScrollName, setCurrentScrollName] = useState<string | null>(null);

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
    const timer = setTimeout(refresh, 0);
    model.onValueChanged.add(refresh);
    return () => {
      clearTimeout(timer);
      model.onValueChanged.remove(refresh);
    };
  }, [model, refresh]);

  // Reference-line scroll tracker: find the deepest .sd-question whose top is still
  // above 30% of the viewport height — that's the question the user is currently reading.
  // Uses data-name attribute to map DOM node → question name → dots index, so DOM render
  // order differences from model.getAllQuestions() order don't cause mis-highlighting.
  useEffect(() => {
    if (!model) return;

    let rafId: number | null = null;
    let nodes: Element[] = [];

    const calcCurrent = () => {
      if (nodes.length === 0) return;
      const ref = window.innerHeight * 0.3;
      let winner: Element = nodes[0];
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].getBoundingClientRect().top <= ref) {
          winner = nodes[i];
        } else {
          break;
        }
      }
      const name = winner.getAttribute('data-name');
      if (name) setCurrentScrollName(name);
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        calcCurrent();
      });
    };

    const attach = (): boolean => {
      const found = Array.from(
        document.querySelectorAll<Element>('.surveyjs-wrapper .sd-question'),
      );
      if (found.length === 0) return false;
      nodes = found;
      calcCurrent();
      window.addEventListener('scroll', onScroll, { passive: true });
      return true;
    };

    if (!attach()) {
      const mo = new MutationObserver(() => {
        if (attach()) mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      return () => {
        mo.disconnect();
        window.removeEventListener('scroll', onScroll);
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [model]);

  // Map tracked question name → dots index; fall back to first unanswered
  const currentIdx = currentScrollName !== null
    ? dots.findIndex((d) => d.name === currentScrollName)
    : dots.findIndex((d) => !d.answered);
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
        className="hidden md:flex md:flex-col md:items-center md:rounded-[16px] md:border md:p-5"
        style={{
          background: '#ffffff',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderColor: 'rgba(15,23,42,0.1)',
          boxShadow: '0 1px 3px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.06)',
          minWidth: 140,
          maxWidth: 170,
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 64,
          maxHeight: 'calc(100vh - 5rem)',
          overflowY: 'auto',
        }}
      >
        {/* Progress header */}
        <div className="mb-2 text-center">
          <div className="text-[11px] font-medium tracking-wide text-[#07183d]">
            作答進度
          </div>
          <div className="mt-0.5 text-lg font-bold text-[#0f172a]">
            {answeredCount}
            <span className="text-sm font-normal text-[#94a3b8]">/{total}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-5 h-[3px] w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #07183d, #2563eb)',
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
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
                  className="block rounded-full border-2 transition-all duration-300"
                  style={
                    isCurrent
                      ? {
                          width: 14,
                          height: 14,
                          borderColor: '#07183d',
                          backgroundColor: '#07183d',
                          boxShadow: '0 0 12px rgba(7,24,61,0.3)',
                          transform: 'scale(1.3)',
                        }
                      : d.answered
                        ? {
                            width: 10,
                            height: 10,
                            borderColor: '#2563eb',
                            backgroundColor: '#2563eb',
                            boxShadow: '0 0 6px rgba(37,99,235,0.4)',
                          }
                        : {
                            width: 10,
                            height: 10,
                            borderColor: 'rgba(0,0,0,0.2)',
                            backgroundColor: 'transparent',
                          }
                  }
                />
                {/* Tooltip on hover */}
                {hovered === i && (
                  <span
                    className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border px-3 py-2 text-left pointer-events-none z-50"
                    style={{
                      background: '#07183d',
                      borderColor: 'rgba(7,24,61,0.2)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    }}
                  >
                    <span className="block text-[11px] font-semibold text-white">
                      第 {i + 1} 題
                    </span>
                    <span
                      className={`block text-[11px] ${d.answered ? 'text-blue-200' : 'text-[#94a3b8]'}`}
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
            <span className="inline-block h-2 w-2 rounded-full border-2 border-[#2563eb] bg-[#2563eb]" />
            <span className="text-[#94a3b8]">已答</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-[#07183d] bg-[#07183d]" />
            <span className="text-[#94a3b8]">當前</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-[rgba(0,0,0,0.2)] bg-transparent" />
            <span className="text-[#94a3b8]">未答</span>
          </div>
        </div>
      </aside>

      {/* ===== Mobile bottom bar ===== */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 overflow-x-auto px-4 py-3 md:hidden"
        style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <span className="shrink-0 text-[11px] font-semibold text-[#07183d]">
          {answeredCount}/{total}
        </span>
        <div className="h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #07183d, #2563eb)',
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
                className="block rounded-full border-2 transition-all duration-300"
                style={
                  isCurrent
                    ? {
                        width: 12,
                        height: 12,
                        borderColor: '#07183d',
                        backgroundColor: '#07183d',
                        boxShadow: '0 0 8px rgba(7,24,61,0.3)',
                      }
                    : d.answered
                      ? {
                          width: 8,
                          height: 8,
                          borderColor: '#2563eb',
                          backgroundColor: '#2563eb',
                          boxShadow: '0 0 4px rgba(37,99,235,0.4)',
                        }
                      : {
                          width: 8,
                          height: 8,
                          borderColor: 'rgba(0,0,0,0.2)',
                          backgroundColor: 'transparent',
                        }
                }
              />
            </button>
          );
        })}
      </div>
    </>
  );
}
