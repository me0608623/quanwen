'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = [
  {
    icon: '📝',
    title: '填問卷賺回報',
    desc: '填寫精準媒合的問卷，賺取現金、超商禮券與積分',
    bgGradient: 'from-blue-500 to-cyan-500',
    textColor: 'text-blue-600',
  },
  {
    icon: '💰',
    title: '付費發問卷',
    desc: '設定受眾與獎勵，系統自動媒合適合的填答者',
    bgGradient: 'from-amber-500 to-orange-500',
    textColor: 'text-amber-600',
  },
  {
    icon: '📊',
    title: '數據分析',
    desc: '即時統計與圖表，讓你快速掌握問卷結果',
    bgGradient: 'from-emerald-500 to-green-500',
    textColor: 'text-emerald-600',
  },
  {
    icon: '🎡',
    title: '轉盤抽獎',
    desc: '完成問卷獲得抽獎機會，最高可得 200 積分',
    bgGradient: 'from-rose-500 to-pink-500',
    textColor: 'text-rose-600',
  },
];

export default function IntroPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // 檢查是否已看過引導（localStorage）
  useEffect(() => {
    const seen = localStorage.getItem('quanwen_intro_seen');
    if (seen) {
      // 已看過，跳轉到主頁面
      router.replace('/tasks');
    }
  }, [router]);

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((prev) => prev + 1);
    } else {
      // 最後一步，標記已看過並跳轉
      localStorage.setItem('quanwen_intro_seen', 'true');
      router.push('/tasks');
    }
  };

  const prev = () => {
    if (step > 0) {
      setStep((prev) => prev - 1);
    }
  };

  const current = STEPS[step];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-blue-50 px-4 py-8">
      {/* 頂部跳過 */}
      <div className="absolute right-4 top-4">
        <button
          onClick={() => {
            localStorage.setItem('quanwen_intro_seen', 'true');
            router.push('/tasks');
          }}
          className="flex min-h-[44px] items-center px-3 text-sm text-slate-400 hover:text-slate-600"
        >
          跳過
        </button>
      </div>

      {/* 主卡片 */}
      <div className="w-full max-w-sm">
        {/* 進度指示器 */}
        <div className="mb-8 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= step ? `bg-gradient-to-r ${current.bgGradient}` : 'bg-slate-200'
              }`}
              style={{ width: i === step ? '32px' : '12px' }}
            />
          ))}
        </div>

        {/* 圖示 */}
        <div className="mb-8 flex justify-center">
          <div
            className={`relative flex h-32 w-32 items-center justify-center rounded-3xl bg-gradient-to-br ${current.bgGradient} shadow-2xl shadow-${current.textColor}/20`}
          >
            <span className="text-7xl">{current.icon}</span>
            {/* 裝飾光暈 */}
            <div className="absolute inset-0 rounded-3xl bg-white/20 backdrop-blur-sm" />
          </div>
        </div>

        {/* 標題與描述 */}
        <h1 className={`mb-4 text-center text-3xl font-black ${current.textColor}`}>
          {current.title}
        </h1>
        <p className="mb-12 text-center text-lg text-slate-600">
          {current.desc}
        </p>

        {/* 導航按鈕 */}
        <div className="flex gap-3">
          {step > 0 ? (
            <button
              onClick={prev}
              className="flex-1 rounded-2xl border-2 border-slate-200 py-4 text-lg font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all"
            >
              上一步
            </button>
          ) : (
            <div className="flex-1" />
          )}

          <button
            onClick={next}
            className={`flex-1 rounded-2xl bg-gradient-to-r ${current.bgGradient} py-4 text-lg font-bold text-white shadow-lg shadow-${current.textColor}/30 hover:scale-[1.02] active:scale-95 transition-all`}
          >
            {step === STEPS.length - 1 ? '開始使用' : '下一步'}
          </button>
        </div>

        {/* 底部文字 */}
        <p className="mt-8 text-center text-sm text-slate-400">
          {step + 1} / {STEPS.length}
        </p>
      </div>

      {/* 底部裝飾 */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-slate-300">
          券問 QuanWen · 讓問卷更有價值
        </p>
      </div>
    </main>
  );
}