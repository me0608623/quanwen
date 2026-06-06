'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useSpinStatus, useSpin, type SpinSegment } from '@/hooks/use-spin';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// 邊緣 LED 金點位置（不旋轉的裝飾層）
const LED_DOTS = Array.from({ length: 24 }, (_, i) => {
  const rad = ((i * (360 / 24) - 90) * Math.PI) / 180;
  return { x: 100 + 96 * Math.cos(rad), y: 100 + 96 * Math.sin(rad), i };
});

export default function SpinPage() {
  const { data: status, isLoading } = useSpinStatus();
  const spin = useSpin();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; points: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<SVGSVGElement>(null);
  const rotationRef = useRef(0);
  const confettiRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // 中獎彩帶 + 結果彈出
  const CONFETTI_COLORS = ['#f59e0b', '#fbbf24', '#fb7185', '#a78bfa', '#34d399', '#fff3c4'];
  const fireConfetti = () => {
    const host = confettiRef.current;
    if (!host) return;
    const W = host.clientWidth || 360;
    for (let i = 0; i < 70; i++) {
      const el = document.createElement('div');
      const size = 6 + Math.random() * 8;
      el.style.cssText = `position:absolute;top:90px;left:${W / 2}px;width:${size}px;height:${size * 0.5}px;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};border-radius:2px;will-change:transform;`;
      host.appendChild(el);
      gsap.fromTo(
        el,
        { x: 0, y: 0, rotation: Math.random() * 360, opacity: 1 },
        {
          x: (Math.random() - 0.5) * W * 1.15,
          y: 360 + Math.random() * 240,
          rotation: `+=${Math.random() * 720 - 360}`,
          opacity: 0,
          duration: 1.8 + Math.random() * 1.2,
          ease: 'power1.out',
          onComplete: () => el.remove(),
        },
      );
    }
  };

  // 中獎輕量音效（升調琶音），無需音檔；瀏覽器不支援就靜默略過
  const playWinChime = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ac = new Ctx();
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ac.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + 0.24);
      });
      setTimeout(() => ac.close().catch(() => {}), 800);
    } catch {
      /* 靜默 */
    }
  };

  useEffect(() => {
    if (!result || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (resultRef.current) {
      gsap.fromTo(resultRef.current, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.8)' });
    }
    if (result.points > 0) {
      fireConfetti();
      playWinChime();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.([40, 60, 120]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const segments = status?.segments ?? [];

  // GSAP：進場 + 氛圍動畫（光暈脈動、LED 閃爍、指針微浮）
  useEffect(() => {
    if (!status || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.set(wheelRef.current, { transformOrigin: '50% 50%' });

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-spin-title]', { y: 20, opacity: 0, duration: 0.6 })
        .from('[data-spin-wheel]', { scale: 0.85, opacity: 0, duration: 0.75, ease: 'back.out(1.6)' }, '-=0.2')
        .from('[data-spin-cta]', { y: 16, opacity: 0, duration: 0.5 }, '-=0.35');

      gsap.to('[data-spin-glow]', { scale: 1.12, opacity: 0.85, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('[data-spin-pointer]', { y: 3, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      // 中心軸金色 glow 呼吸（動 boxShadow，不碰 transform 以保持置中）
      // 只在有抽獎次數時呼吸；沒次數維持灰階靜止
      if (status.canSpin) {
        gsap.to('[data-spin-hub]', {
          boxShadow:
            '0 4px 24px rgba(245,200,90,0.85), 0 0 12px rgba(245,200,90,0.6), inset 0 2px 6px rgba(255,255,255,0.7)',
          duration: 1.2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      }
      gsap.to('.led-dot', {
        opacity: 0.35,
        duration: 0.9,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: { each: 0.08, from: 'random' },
      });
    }, rootRef);
    return () => ctx.revert();
  }, [status]);

  const handleSpin = async () => {
    if (!status?.canSpin || spinning) return;
    setSpinning(true);
    setResult(null);
    try {
      const res = await spin.mutateAsync();
      const found = segments.findIndex((s) => s.key === res.prizeKey);
      const idx = found < 0 ? 0 : found; // 防呆：後端回傳意外 key 時落點不歪
      const segAngle = 360 / segments.length;
      const delta = 360 * 5 + (360 - (idx * segAngle + segAngle / 2));
      rotationRef.current += delta;

      const finish = () => {
        setResult({ label: res.label, points: res.pointsWon });
        setSpinning(false);
      };

      if (wheelRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.to(wheelRef.current, {
          rotation: rotationRef.current,
          duration: 4.6,
          ease: 'power4.out',
          transformOrigin: '50% 50%',
          onComplete: finish,
        });
      } else {
        gsap.set(wheelRef.current, { rotation: rotationRef.current, transformOrigin: '50% 50%' });
        finish();
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '轉盤失敗');
      setSpinning(false);
    }
  };

  if (isLoading) {
    return <main className="mx-auto max-w-lg px-4 py-12"><LoadingSpinner /></main>;
  }

  return (
    <main ref={rootRef} className="mx-auto max-w-2xl px-4 py-10">
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-200/70 bg-gradient-to-b from-amber-50 via-white to-rose-50/50 px-6 py-10 text-center shadow-xl shadow-amber-200/40 sm:px-10">
        {/* 暖金氛圍光 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 26%, rgba(245,200,90,0.22), transparent 62%)' }}
        />

        {/* 中獎彩帶層 */}
        <div ref={confettiRef} aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden" />

        <div className="relative">
          <div data-spin-title>
            <h1 className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
              🎡 轉盤抽獎
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              每完成一份問卷 +1 次抽獎機會，最高可得{' '}
              <span className="font-bold text-amber-600">200 點</span>！
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-5 py-2 text-sm font-bold text-amber-700 shadow-inner">
              🎟️ 剩餘抽獎次數：{status?.availableChances ?? 0}
            </div>
            {status && (status.earnedTotal > 0 || status.spentTotal > 0) && (
              <p className="mt-2 text-xs text-slate-500">
                累計獲得 {status.earnedTotal} 次 · 已使用 {status.spentTotal} 次
              </p>
            )}
          </div>

          {/* 轉盤 */}
          <div data-spin-wheel className="relative mx-auto mt-8 h-[340px] w-[340px] sm:h-[440px] sm:w-[440px]">
            {/* 外圈光暈 */}
            <div data-spin-glow aria-hidden className="absolute inset-0 rounded-full bg-amber-400/30 blur-2xl" />

            {/* 金色立體外框 */}
            <div
              className="absolute inset-0 rounded-full p-[14px]"
              style={{
                background:
                  'conic-gradient(from 0deg, #f6e27a, #b8860b, #fff3c4, #caa14a, #f6e27a, #8a6d1d, #fff3c4, #b8860b, #f6e27a)',
                boxShadow:
                  '0 18px 50px rgba(180,134,11,0.35), inset 0 0 14px rgba(255,243,196,0.7), inset 0 0 3px rgba(120,94,16,0.9)',
              }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-full bg-white">
                {/* 旋轉的扇形盤面（GSAP 控制 rotation） */}
                <svg ref={wheelRef} viewBox="0 0 200 200" className="h-full w-full">
                  <defs>
                    <radialGradient id="gloss" cx="50%" cy="28%" r="75%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
                      <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
                    </radialGradient>
                  </defs>
                  {segments.map((seg, i) => (
                    <Wedge key={seg.key} seg={seg} index={i} total={segments.length} />
                  ))}
                  <circle cx="100" cy="100" r="95" fill="url(#gloss)" pointerEvents="none" />
                </svg>

                {/* 不旋轉的 LED 金點裝飾 */}
                <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
                  {LED_DOTS.map((d) => (
                    <circle
                      key={d.i}
                      className="led-dot"
                      cx={d.x}
                      cy={d.y}
                      r="2.1"
                      fill={d.i % 2 === 0 ? '#fbbf24' : '#f59e0b'}
                      style={{ filter: 'drop-shadow(0 0 2px rgba(245,180,40,0.9))' }}
                    />
                  ))}
                </svg>
              </div>
            </div>

            {/* 金色寶石指針 */}
            <svg
              data-spin-pointer
              className="absolute left-1/2 -top-3 z-20 -translate-x-1/2 drop-shadow-[0_3px_5px_rgba(0,0,0,0.25)]"
              width="36"
              height="44"
              viewBox="0 0 36 44"
            >
              <defs>
                <linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff3c4" />
                  <stop offset="100%" stopColor="#b8860b" />
                </linearGradient>
              </defs>
              <path d="M18 42 L3 8 Q18 0 33 8 Z" fill="url(#ptr)" stroke="#7c5e10" strokeWidth="1.5" />
              <circle cx="18" cy="11" r="4.2" fill="#ef4444" stroke="#fff" strokeWidth="0.8" />
            </svg>

            {/* 金色中心軸（可點擊觸發轉盤） */}
            <button
              data-spin-hub
              type="button"
              onClick={handleSpin}
              disabled={!status?.canSpin || spinning}
              aria-label={status?.canSpin ? '開始抽獎' : '目前沒有抽獎次數'}
              className={`absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-black tracking-widest shadow-[0_4px_16px_rgba(180,134,11,0.4),inset_0_2px_6px_rgba(255,255,255,0.6)] transition-transform sm:h-20 sm:w-20 sm:text-xs ${
                status?.canSpin || spinning
                  ? 'cursor-pointer border-amber-200/90 bg-gradient-to-br from-amber-200 via-yellow-500 to-amber-700 text-amber-950 hover:scale-105 active:scale-95 disabled:scale-100'
                  : 'cursor-not-allowed border-slate-300/80 bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-500 shadow-none grayscale'
              }`}
            >
              {spinning ? '轉動中' : status?.canSpin ? 'SPIN' : '沒次數'}
            </button>
          </div>

          {/* 結果 */}
          {result && (
            <div ref={resultRef} className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <p className="text-xl font-extrabold text-amber-700">
                {result.points > 0 ? `🎉 恭喜！${result.label}` : `😅 ${result.label}`}
              </p>
              {result.points > 0 && (
                <>
                  <p className="mt-1 text-sm text-amber-600">{result.points} 積分已存入錢包</p>
                  <div className="mt-3 flex justify-center gap-4 text-sm font-semibold">
                    <Link href="/shop" className="text-amber-700 hover:underline">去商城兌換 →</Link>
                    <Link href="/wallet" className="text-amber-700 hover:underline">查看錢包 →</Link>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 按鈕 */}
          <div data-spin-cta className="mt-8">
            {status?.canSpin ? (
              <button
                onClick={handleSpin}
                disabled={spinning}
                className="rounded-full border border-amber-200/70 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-12 py-4 text-lg font-black text-amber-950 shadow-[0_10px_30px_rgba(202,138,4,0.4),inset_0_2px_6px_rgba(255,255,255,0.6)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {spinning ? '✨ 轉動中…' : `轉一次（剩 ${status.availableChances} 次）`}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="inline-block rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm text-slate-500">
                  目前沒有抽獎次數 — 完成一份問卷就能再轉！
                </div>
                <div className="flex justify-center gap-4 text-sm">
                  <Link href="/tasks" className="font-semibold text-amber-600 hover:underline">
                    去填問卷賺次數 →
                  </Link>
                  <Link href="/mutual" className="font-semibold text-amber-600 hover:underline">
                    互惠問卷 →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 獎項說明 */}
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-amber-600/90">轉盤獎項</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
                    style={{ background: s.color }}
                  />
                  <span className="font-medium">{s.label}</span>
                  <span className="text-slate-400">({s.weight}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Wedge({ seg, index, total }: { seg: SpinSegment; index: number; total: number }) {
  const angle = 360 / total;
  const start = index * angle;
  const end = start + angle;
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [100 + 95 * Math.cos(rad), 100 + 95 * Math.sin(rad)];
  };
  const [x1, y1] = toXY(start);
  const [x2, y2] = toXY(end);
  const largeArc = angle > 180 ? 1 : 0;
  const path = `M100,100 L${x1.toFixed(2)},${y1.toFixed(2)} A95,95 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;

  const mid = start + angle / 2;
  const [lx, ly] = (() => {
    const rad = ((mid - 90) * Math.PI) / 180;
    return [100 + 60 * Math.cos(rad), 100 + 60 * Math.sin(rad)];
  })();

  return (
    <g>
      <path d={path} fill={seg.color} stroke="#f6e27a" strokeWidth="0.8" strokeLinejoin="round" />
      <text
        x={lx}
        y={ly}
        fill="#1e293b"
        fontSize="9.5"
        fontWeight="800"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${mid}, ${lx}, ${ly})`}
        style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.55)', strokeWidth: 0.6 }}
      >
        {seg.points > 0 ? `${seg.points}` : '銘謝'}
      </text>
    </g>
  );
}
