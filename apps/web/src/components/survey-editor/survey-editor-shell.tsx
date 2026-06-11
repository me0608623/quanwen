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
  /** Whether the survey can be edited (draft / rejected，或已發布的資訊編輯模式) */
  canEdit: boolean;
  /** Whether the publish button is available（已發布資訊編輯模式 = false）。預設同 canEdit */
  canPublish?: boolean;
  /** Status badge label */
  statusLabel: string;
  /** Raw survey status for conditional button rendering */
  surveyStatus?: 'draft' | 'pending_review' | 'published' | 'paused' | 'closed' | 'rejected';
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
  /** Pause/unpublish the survey (published → paused) */
  onPause?: () => Promise<void>;
  pausePending?: boolean;
  /** Permanently close the survey */
  onClose?: () => Promise<void>;
  closePending?: boolean;
  /** Re-publish a paused survey */
  onRepublish?: () => Promise<void>;
  republishPending?: boolean;

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
  canPublish = canEdit,
  statusLabel,
  surveyStatus,
  dirty,
  savePending,
  publishPending,
  onSave,
  onPublish,
  onBack,
  onPause,
  pausePending = false,
  onClose,
  closePending = false,
  onRepublish,
  republishPending = false,
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
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

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
      {/* On mobile: wrap to two rows (title row + scrollable action row). On md+: single row. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-white px-4 py-2 md:flex-nowrap md:py-2.5">
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

        {/* Action buttons — mobile: full-width scrollable row; md+: inline shrink-0 */}
        <div
          className="flex w-full items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-auto md:shrink-0"
          role="toolbar"
          aria-label="問卷操作工具列"
        >
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
              {savePending ? '儲存中…' : dirty ? (canPublish ? '儲存草稿' : '儲存變更') : '已儲存'}
            </button>
          )}

          {canPublish && (
            <button
              type="button"
              onClick={onPublish}
              disabled={publishPending}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {publishPending ? '發布中…' : '發布'}
            </button>
          )}

          {/* 下架/暫停：published 狀態才顯示 */}
          {surveyStatus === 'published' && onPause && (
            <button
              type="button"
              onClick={() => setShowPauseConfirm(true)}
              disabled={pausePending}
              aria-label="下架/暫停問卷"
              className="rounded-md border border-yellow-400 bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100 disabled:opacity-60"
            >
              {pausePending ? '處理中…' : '⏸ 下架/暫停'}
            </button>
          )}

          {/* 重新上架：paused 狀態才顯示 */}
          {surveyStatus === 'paused' && onRepublish && (
            <button
              type="button"
              onClick={onRepublish}
              disabled={republishPending}
              aria-label="重新上架問卷"
              className="rounded-md border border-green-500 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
            >
              {republishPending ? '上架中…' : '▶ 重新上架'}
            </button>
          )}

          {/* 結案：published 或 paused 狀態才顯示 */}
          {(surveyStatus === 'published' || surveyStatus === 'paused') && onClose && (
            <button
              type="button"
              onClick={() => setShowCloseConfirm(true)}
              disabled={closePending}
              aria-label="結案問卷"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              {closePending ? '結案中…' : '🔒 結案'}
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

      {/* 下架/暫停確認 modal */}
      {showPauseConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPauseConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground">確認下架/暫停問卷</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              暫停後填答者<strong>無法作答</strong>，問卷從任務列表移除。預算維持鎖定，可隨時重新上架。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPauseConfirm(false)}
                className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onPause?.();
                  setShowPauseConfirm(false);
                }}
                disabled={pausePending}
                className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-60"
              >
                {pausePending ? '處理中…' : '確認下架'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 結案確認 modal */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowCloseConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground">確認結案</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              結案後<strong>永久無法再收答</strong>，問卷將進入統計分析模式。未用預算將退回錢包（cashBalance）。
            </p>
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              ⚠️ 此操作<strong>不可撤銷</strong>，結案後無法重新上架。
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-md border border-input px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onClose?.();
                  setShowCloseConfirm(false);
                }}
                disabled={closePending}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                {closePending ? '結案中…' : '確認結案'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
