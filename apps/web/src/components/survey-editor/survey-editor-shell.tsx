'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SidebarTab = 'questions' | 'styling' | 'rewards' | 'settings';

interface SurveyEditorShellProps {
  /** Survey title displayed in the top bar (controlled) */
  surveyTitle: string;
  /** Callback when the title is edited */
  onTitleChange: (title: string) => void;
  /** Whether the survey can be edited (draft / rejected) */
  canEdit: boolean;
  /** Status badge label */
  statusLabel: string;
  /** Whether there are unsaved changes */
  dirty: boolean;
  /** Is save in progress? */
  savePending: boolean;
  /** Is publish in progress? */
  publishPending: boolean;
  /** Callback when user clicks Save Draft */
  onSave: () => void;
  /** Callback when user clicks Publish */
  onPublish: () => void;
  /** Callback when user navigates back */
  onBack: () => void;

  /** Content for each sidebar tab */
  questionsSidebar: ReactNode;
  stylingSidebar?: ReactNode;
  rewardsSidebar?: ReactNode;
  settingsSidebar?: ReactNode;

  /** Main content area (center) */
  children: ReactNode;

  /** Right preview pane content */
  previewPane: ReactNode;

  /** Controlled: whether preview pane is open */
  previewOpen: boolean;
  /** Toggle preview pane */
  onPreviewToggle: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SurveyEditorShell({
  surveyTitle,
  onTitleChange,
  canEdit,
  statusLabel,
  dirty,
  savePending,
  publishPending,
  onSave,
  onPublish,
  onBack,
  questionsSidebar,
  stylingSidebar,
  rewardsSidebar,
  settingsSidebar,
  children,
  previewPane,
  previewOpen,
  onPreviewToggle,
}: SurveyEditorShellProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('questions');
  // 手機：側欄改抽屜（固定 w-56 在小螢幕會吃掉一半寬度，壓爛中間編輯區）
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarContent = (() => {
    switch (activeTab) {
      case 'questions':
        return questionsSidebar;
      case 'styling':
        return stylingSidebar ?? (
          <div className="p-4 text-sm text-muted-foreground">
            樣式選項即將推出。
          </div>
        );
      case 'rewards':
        return rewardsSidebar ?? (
          <div className="p-4 text-sm text-muted-foreground">
            獎勵設定即將推出。
          </div>
        );
      case 'settings':
        return settingsSidebar ?? (
          <div className="p-4 text-sm text-muted-foreground">
            設定即將推出。
          </div>
        );
    }
  })();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-lg border border-border">
      {/* ─── Top Bar ─────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-2.5">
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="返回儀表板"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>

        {/* Editable survey title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {canEdit ? (
            <input
              type="text"
              value={surveyTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={200}
              className="w-full max-w-sm truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-foreground hover:border-input focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="未命名問卷"
            />
          ) : (
            <span className="truncate text-sm font-semibold text-foreground">
              {surveyTitle || '未命名問卷'}
            </span>
          )}
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              statusLabel === '已發布' && 'bg-green-100 text-green-800',
              statusLabel === '草稿' && 'bg-slate-100 text-slate-600',
              statusLabel === '審核中' && 'bg-yellow-100 text-yellow-800',
              statusLabel === '已退回' && 'bg-red-100 text-red-700',
              statusLabel === '已暫停' && 'bg-orange-100 text-orange-700',
              statusLabel === '已關閉' && 'bg-gray-100 text-gray-600',
            )}
          >
            {statusLabel}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 手機：開啟題目/樣式/獎勵/設定抽屜 */}
          <button
            type="button"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:hidden"
            aria-label="開啟題目與設定面板"
          >
            ☰ 題目
          </button>

          {/* Preview toggle */}
          <button
            type="button"
            onClick={onPreviewToggle}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
              previewOpen
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {previewOpen ? '隱藏預覽' : '預覽'}
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={onSave}
              disabled={savePending || !dirty}
              className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {savePending ? '儲存中…' : dirty ? '儲存草稿' : '已儲存'}
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={onPublish}
              disabled={publishPending}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {publishPending ? '發布中…' : '發布'}
            </button>
          )}
        </div>
      </header>

      {/* ─── Main body: Sidebar + Content + Preview ──────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 手機抽屜背景遮罩 */}
        {mobileSidebarOpen && (
          <div
            className="absolute inset-0 z-30 bg-black/30 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
        )}

        {/* Left sidebar with tabs（手機 = 抽屜，桌機 = 常駐） */}
        <aside
          className={cn(
            'flex w-56 shrink-0 flex-col border-r border-border bg-slate-50/50',
            'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-72 max-md:bg-slate-50 max-md:shadow-xl',
            !mobileSidebarOpen && 'max-md:hidden',
          )}
        >
          {/* Sidebar tabs */}
          <nav className="flex border-b border-border">
            {([
              { id: 'questions' as SidebarTab, label: '題目' },
              { id: 'styling' as SidebarTab, label: '樣式' },
              { id: 'rewards' as SidebarTab, label: '獎勵' },
              { id: 'settings' as SidebarTab, label: '設定' },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 border-b-2 px-2 py-2.5 text-[11px] font-medium transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Sidebar content area（手機：點選任一項目後自動收合抽屜） */}
          <div
            className="flex-1 overflow-y-auto"
            onClickCapture={(e) => {
              if (
                mobileSidebarOpen &&
                window.matchMedia('(max-width: 767px)').matches &&
                (e.target as HTMLElement).closest('button')
              ) {
                setMobileSidebarOpen(false);
              }
            }}
          >
            {sidebarContent}
          </div>
        </aside>

        {/* Center content area */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-2xl p-6">{children}</div>
        </main>

        {/* Right preview pane (optional)；手機 = 全寬覆蓋（避免擠壓編輯區） */}
        {previewOpen && (
          <aside className="w-80 shrink-0 border-l border-border bg-white overflow-y-auto max-md:absolute max-md:inset-0 max-md:z-40 max-md:w-full">
            <div className="p-3">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                即時預覽
              </h3>
              {previewPane}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
