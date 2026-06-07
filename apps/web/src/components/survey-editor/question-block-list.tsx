'use client';

import { useState, useCallback, type DragEvent } from 'react';
import type { SurveyQuestion } from '@/hooks/use-surveys';
import { cn } from '@/lib/utils';
import { getSectionBreak, SECTION_COLORS, type SectionBreak } from '@/lib/surveyjs-adapter';

// ─── Types ──────────────────────────────────────────────────────────────────

type QuestionType = SurveyQuestion['type'];

interface QuestionBlockListProps {
  questions: SurveyQuestion[];
  canEdit: boolean;
  onReorder: (questions: SurveyQuestion[]) => void;
  onDelete: (index: number) => void;
  onAdd: (type: QuestionType, presetConfig?: Record<string, unknown>) => void;
  /** Optional: callback to duplicate a question */
  onDuplicate?: (index: number) => void;
  /** Optional: 更新某題（區段標記等 config 變更用） */
  onUpdateQuestion?: (index: number, next: SurveyQuestion) => void;
  /** Optional: currently selected question index */
  selectedIndex?: number;
  /** Optional: callback when a question is clicked */
  onSelect?: (index: number) => void;
}

// ─── Question type selector options ─────────────────────────────────────────

// 題型總覽：只列出平台真正能渲染的題型；變體（下拉/是否/數字/複選矩陣）帶 preset config。
const QUESTION_TYPE_OPTIONS: {
  key: string;
  value: QuestionType;
  label: string;
  icon: string;
  description: string;
  config?: Record<string, unknown>;
}[] = [
  { key: 'single_choice', value: 'single_choice', label: '單選題', icon: '◉', description: '填答者僅能選擇一個選項' },
  { key: 'multiple_choice', value: 'multiple_choice', label: '複選題', icon: '☑', description: '填答者可選擇一至多個選項' },
  { key: 'dropdown', value: 'single_choice', label: '下拉選單', icon: '▾', description: '選項收合成下拉清單，適合選項較多時', config: { renderAs: 'dropdown' } },
  { key: 'yes_no', value: 'single_choice', label: '是／否題', icon: '◐', description: '二選一的是非題', config: { variant: 'yes_no' } },
  { key: 'text', value: 'text', label: '文字題', icon: '☰', description: '開放式文字作答（簡答或詳答）' },
  { key: 'numeric', value: 'text', label: '數字題', icon: '#', description: '僅能輸入數字，蒐集純數值回覆', config: { inputType: 'numeric' } },
  { key: 'rating', value: 'rating', label: '評分題', icon: '★', description: '星級／分數量表（1–N 分）' },
  { key: 'matrix', value: 'matrix', label: '單選矩陣', icon: '▦', description: '多個子題共用同一量表，每列單選' },
  { key: 'matrix_multi', value: 'matrix', label: '複選矩陣', icon: '▤', description: '多個子題共用同一量表，每列可複選', config: { matrix: { multiple: true } } },
  { key: 'encrypted', value: 'text', label: '個資加密題', icon: '🔒', description: '敏感個資加密儲存，僅超級管理員可解密查看', config: { encrypted: true } },
];

// 題型中文名稱對照（用於側邊欄 block 顯示）
const TYPE_DISPLAY: Record<string, string> = {
  single_choice: '單選',
  multiple_choice: '多選',
  text: '問答',
  rating: '評分',
  matrix: '單選矩陣',
};

// 側邊欄標籤：依 config 判斷變體（個資加密/數字/是否/下拉/複選矩陣），與編輯器一致
function blockTypeLabel(q: SurveyQuestion): string {
  const c = (q.config ?? {}) as Record<string, unknown>;
  if (q.type === 'text' && c.encrypted === true) return '個資加密題';
  if (q.type === 'text' && c.inputType === 'numeric') return '數字';
  if (q.type === 'single_choice' && c.variant === 'yes_no') return '是/否';
  if (q.type === 'single_choice' && c.renderAs === 'dropdown') return '下拉選單';
  if (q.type === 'matrix' && (c.matrix as { multiple?: boolean } | undefined)?.multiple) return '複選矩陣';
  return TYPE_DISPLAY[q.type] ?? q.type.replace('_', ' ');
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QuestionBlockList({
  questions,
  canEdit,
  onReorder,
  onDelete,
  onAdd,
  onDuplicate,
  onUpdateQuestion,
  selectedIndex,
  onSelect,
}: QuestionBlockListProps) {
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  // 正在編輯區段設定的題目 index（null = 無）
  const [sectionEditIndex, setSectionEditIndex] = useState<number | null>(null);

  // ── 區段標記操作（存於該題 config.sectionBreak = 新頁從此題開始）──
  const sectionOf = (q: SurveyQuestion) => getSectionBreak(q.config);
  const setSection = (index: number, sb: SectionBreak | null) => {
    const q = questions[index];
    if (!q || !onUpdateQuestion) return;
    const nextConfig = { ...(q.config ?? {}) } as Record<string, unknown>;
    if (sb) nextConfig.sectionBreak = sb;
    else delete nextConfig.sectionBreak;
    onUpdateQuestion(index, { ...q, config: nextConfig });
  };

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
        問卷結構
      </div>

      {/* Welcome Card block — 可點擊回到歡迎頁/AI 面板總覽（selectedIndex === -1） */}
      <button
        type="button"
        onClick={() => onSelect?.(-1)}
        className={cn(
          'w-full rounded-md border bg-white px-3 py-2 text-left text-xs transition-all',
          selectedIndex === -1 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">📋</span>
          <span className="font-medium text-foreground">歡迎頁面</span>
          <span className="ml-auto text-[10px] text-muted-foreground">圖片 · AI 工具</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {questions.length > 0 ? questions[0].title || '簡介' : '新增題目以開始'}
        </p>
      </button>

      {/* Question blocks (draggable) */}
      {questions.map((q, index) => {
        const isDragging = dragIndex === index;
        const isDropTarget = dropTargetIndex === index && dragIndex !== index;
        const isSelected = selectedIndex === index;
        const section = sectionOf(q);

        return (
          <div key={q.id || index} className="space-y-1">
            {/* 區段標頭（此題為新區段/新頁的起點） */}
            {section && (
              <button
                type="button"
                onClick={() => canEdit && setSectionEditIndex(sectionEditIndex === index ? null : index)}
                className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold"
                style={{ borderLeft: `4px solid ${section.color}`, background: `${section.color}14`, color: section.color }}
                title={canEdit ? '點擊編輯區段設定' : undefined}
              >
                ▸ {section.name}
                <span className="ml-auto font-normal opacity-70">新頁起點</span>
              </button>
            )}

            {/* 區段編輯面板 */}
            {canEdit && sectionEditIndex === index && (
              <div className="rounded-md border border-border bg-white p-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={section?.name ?? ''}
                  onChange={(e) => setSection(index, { name: e.target.value, color: section?.color ?? SECTION_COLORS[0], description: section?.description })}
                  maxLength={50}
                  placeholder="區段名稱（如：基本資料）"
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={section?.description ?? ''}
                  onChange={(e) => setSection(index, { name: section?.name ?? '新區段', color: section?.color ?? SECTION_COLORS[0], description: e.target.value || undefined })}
                  maxLength={200}
                  placeholder="區段說明（選填）"
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {SECTION_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSection(index, { name: section?.name ?? '新區段', color: c, description: section?.description })}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition-transform',
                        section?.color === c ? 'scale-110 border-foreground' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`區段顏色 ${c}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => { setSection(index, null); setSectionEditIndex(null); }}
                    className="ml-auto text-[11px] text-destructive hover:underline"
                  >
                    移除區段
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">填答時此區段會獨立成一頁，自動顯示上一頁／下一頁。</p>
              </div>
            )}

          <div
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
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                Q{index + 1}
              </span>

              {/* Question title */}
              <span className="flex-1 truncate font-medium text-foreground">
                {q.title || '未命名題目'}
              </span>

              {/* Required badge */}
              {q.isRequired && (
                <span className="text-[10px] text-red-400">*</span>
              )}

              {/* 區段按鈕：設此題為新區段（新頁）起點 / 開啟區段設定 */}
              {canEdit && onUpdateQuestion && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!section) {
                      setSection(index, { name: `區段 ${index + 1}`, color: SECTION_COLORS[0] });
                    }
                    setSectionEditIndex(sectionEditIndex === index ? null : index);
                  }}
                  className={cn(
                    'shrink-0 rounded p-0.5 transition-opacity',
                    section
                      ? 'opacity-100'
                      : 'text-muted-foreground opacity-0 group-hover:opacity-100 max-sm:opacity-60 hover:text-primary',
                  )}
                  style={section ? { color: section.color } : undefined}
                  aria-label={section ? '編輯區段設定' : `從第 ${index + 1} 題開始新區段`}
                  title={section ? '編輯區段設定' : '從此題開始新區段（新頁）'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9h18" />
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                  </svg>
                </button>
              )}

              {/* Duplicate button (shown on hover or focus) */}
              {canEdit && onDuplicate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(index);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 max-sm:opacity-60 hover:text-primary transition-opacity"
                  aria-label={`複製第 ${index + 1} 題`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              )}

              {/* Delete button (shown on hover or focus) */}
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 max-sm:opacity-60 hover:text-destructive transition-opacity"
                  aria-label={`刪除第 ${index + 1} 題`}
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
            <div className="mt-0.5 pl-7 text-[10px] text-muted-foreground">
              {blockTypeLabel(q)}
            </div>
          </div>
          </div>
        );
      })}

      {/* Endings block — 可點擊開啟感謝頁編輯面板（selectedIndex === -2） */}
      <button
        type="button"
        onClick={() => onSelect?.(-2)}
        className={cn(
          'w-full rounded-md border bg-white px-3 py-2 text-left text-xs transition-all',
          selectedIndex === -2 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">🏁</span>
          <span className="font-medium text-foreground">結束設定</span>
          <span className="ml-auto text-[10px] text-muted-foreground">文字 · 圖片 · 導向</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          感謝頁面 & 重新導向
        </p>
      </button>

      {/* Add Question button with type selector */}
      {canEdit && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTypeSelector((prev) => !prev)}
            className="w-full rounded-md border-2 border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            + 新增題目
          </button>

          {/* Type selector dropdown — 題型總覽（含說明）*/}
          {showTypeSelector && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-white p-1 shadow-lg">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">題型總覽</p>
              {QUESTION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onAdd(opt.value, opt.config);
                    setShowTypeSelector(false);
                  }}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <span className="mt-0.5 text-sm">{opt.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{opt.label}</span>
                    <span className="block text-[10px] leading-snug text-muted-foreground">{opt.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
