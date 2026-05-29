'use client';

import { useState, useCallback, type DragEvent } from 'react';
import type { SurveyQuestion } from '@/hooks/use-surveys';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

type QuestionType = SurveyQuestion['type'];

interface QuestionBlockListProps {
  questions: SurveyQuestion[];
  canEdit: boolean;
  onReorder: (questions: SurveyQuestion[]) => void;
  onDelete: (index: number) => void;
  onAdd: (type: QuestionType) => void;
  /** Optional: currently selected question index */
  selectedIndex?: number;
  /** Optional: callback when a question is clicked */
  onSelect?: (index: number) => void;
}

// ─── Question type selector options ─────────────────────────────────────────

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string; icon: string }[] = [
  { value: 'single_choice', label: 'Single Choice', icon: '◉' },
  { value: 'multiple_choice', label: 'Multiple Choice', icon: '☑' },
  { value: 'text', label: 'Text', icon: '☰' },
  { value: 'rating', label: 'Rating', icon: '★' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function QuestionBlockList({
  questions,
  canEdit,
  onReorder,
  onDelete,
  onAdd,
  selectedIndex,
  onSelect,
}: QuestionBlockListProps) {
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // ─── Drag & Drop handlers ──────────────────────────────────────

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Set a minimal drag image (some browsers require this)
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetIndex: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setDropTargetIndex(null);
        return;
      }

      const reordered = [...questions];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      // Re-index sortOrder
      const updated = reordered.map((q, idx) => ({ ...q, sortOrder: idx }));

      onReorder(updated);
      setDragIndex(null);
      setDropTargetIndex(null);
    },
    [dragIndex, questions, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTargetIndex(null);
  }, []);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-1 p-3">
      {/* Section label */}
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Survey Structure
      </div>

      {/* Welcome Card block (static) */}
      <div className="rounded-md border border-border bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">📋</span>
          <span className="font-medium text-foreground">Welcome Card</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {questions.length > 0 ? questions[0].title || 'Introduction' : 'Add questions to get started'}
        </p>
      </div>

      {/* Question blocks (draggable) */}
      {questions.map((q, index) => {
        const isDragging = dragIndex === index;
        const isDropTarget = dropTargetIndex === index && dragIndex !== index;
        const isSelected = selectedIndex === index;

        return (
          <div
            key={q.id || index}
            draggable={canEdit}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect?.(index)}
            className={cn(
              'group relative rounded-md border bg-white px-3 py-2 text-xs transition-all cursor-default',
              isDragging && 'opacity-40 scale-[0.98]',
              isDropTarget && 'border-primary border-dashed bg-primary/5',
              isSelected && 'border-primary bg-primary/5',
              !isDragging && !isDropTarget && !isSelected && 'border-border hover:border-primary/30',
              canEdit && 'cursor-grab active:cursor-grabbing',
            )}
          >
            <div className="flex items-center gap-2">
              {/* Drag handle */}
              {canEdit && (
                <span className="text-muted-foreground/50 cursor-grab text-[10px] select-none">
                  ⠿
                </span>
              )}

              {/* Question number + type icon */}
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Q{index + 1}
              </span>

              {/* Question title */}
              <span className="flex-1 truncate font-medium text-foreground">
                {q.title || 'Untitled question'}
              </span>

              {/* Required badge */}
              {q.isRequired && (
                <span className="text-[10px] text-red-400">*</span>
              )}

              {/* Delete button (shown on hover or focus) */}
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  aria-label={`Delete question ${index + 1}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>

            {/* Type label */}
            <div className="mt-0.5 pl-7 text-[10px] capitalize text-muted-foreground">
              {q.type.replace('_', ' ')}
            </div>
          </div>
        );
      })}

      {/* Endings block (static) */}
      <div className="rounded-md border border-border bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">🏁</span>
          <span className="font-medium text-foreground">Endings</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Thank you screen &amp; redirect
        </p>
      </div>

      {/* Add Question button with type selector */}
      {canEdit && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTypeSelector((prev) => !prev)}
            className="w-full rounded-md border-2 border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            + Add Question
          </button>

          {/* Type selector dropdown */}
          {showTypeSelector && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-border bg-white p-1 shadow-lg">
              {QUESTION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onAdd(opt.value);
                    setShowTypeSelector(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <span className="text-sm">{opt.icon}</span>
                  <span className="font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
