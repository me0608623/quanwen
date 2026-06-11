'use client';

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/components/ui/use-focus-trap';
import { useLockBodyScroll } from '@/components/ui/use-lock-body-scroll';
import { getToken } from '@/lib/token';

const STORAGE_KEY = 'quanwen_welcome_seen';

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(dialogRef, open);
  useLockBodyScroll(open);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!getToken()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setOpen(true);
  }, []);

  const handleConfirm = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* storage blocked */
    }
    setOpen(false);
  };

  useEffect(() => {
    if (open && confirmRef.current) {
      confirmRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      aria-describedby="welcome-modal-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90dvh]"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#126b8a] to-[#0f5d78] text-white text-lg">
              👋
            </div>
            <div>
              <h2 id="welcome-modal-title" className="text-lg font-bold text-gray-900">
                歡迎來到券問 QuanWen
              </h2>
              <p className="text-sm text-gray-500">在開始前，讓我們快速說明平台定位</p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          id="welcome-modal-desc"
          className="overflow-y-auto px-6 py-5 space-y-5 text-sm text-gray-700 leading-relaxed"
        >
          {/* Platform purpose */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-1.5">🎯 平台目的</h3>
            <p>
              券問是一個<strong>問卷雙邊媒合平台</strong>，專注於連結「需要受訪者」的問卷發布者，
              與「願意填答並獲得獎勵」的受訪者，大幅提升問卷的回收效率。
            </p>
          </section>

          {/* Features */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-1.5">📊 平台提供的功能</h3>
            <ul className="space-y-1.5 pl-4 list-disc">
              <li><strong>建立問卷</strong>：自行編輯題目內容或從外部匯入</li>
              <li><strong>媒合受訪者</strong>：透過市集或互惠配對快速找到填答對象</li>
              <li>
                <strong>問卷數據分析</strong>：統計摘要、AI 智慧報告、JASP / SPSS 格式匯出等，
                讓數據立即可用
              </li>
            </ul>
          </section>

          {/* Positioning */}
          <section className="rounded-xl bg-blue-50 border border-blue-100 p-4">
            <h3 className="font-semibold text-blue-900 mb-1.5">💡 我們的定位</h3>
            <p className="text-blue-800">
              券問專注於「<strong>媒合效率 + 數據分析</strong>」。
              若你需要更完整的問卷設計工具（如複雜邏輯跳題、精美版型），
              建議先使用{' '}
              <span className="font-medium">Google Forms、Google Sheets 或 SurveyCake</span>{' '}
              等專業問卷平台製作問卷內容，再回到券問媒合受訪者並分析結果。
            </p>
          </section>

          {/* Closing */}
          <p className="text-gray-500 text-xs">
            這份說明只會在你第一次登入時出現，之後不再顯示。祝你研究順利！
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            className="rounded-xl bg-[#126b8a] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#0f5d78] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#126b8a]"
          >
            我已了解，開始使用
          </button>
        </div>
      </div>
    </div>
  );
}
