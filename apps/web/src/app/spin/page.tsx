'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSpinStatus, useSpin, type SpinSegment } from '@/hooks/use-spin';

export default function SpinPage() {
  const { data: status, isLoading } = useSpinStatus();
  const spin = useSpin();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; points: number } | null>(null);

  const segments = status?.segments ?? [];

  const handleSpin = async () => {
    if (!status?.canSpin || spinning) return;
    setSpinning(true);
    setResult(null);
    try {
      const res = await spin.mutateAsync();
      // 找到中獎格子的角度，轉盤停在那
      const idx = segments.findIndex((s) => s.key === res.prizeKey);
      const segAngle = 360 / segments.length;
      // 轉 5 圈 + 停在中獎格中心（指針在頂端 12 點鐘方向）
      const target = 360 * 5 + (360 - (idx * segAngle + segAngle / 2));
      setRotation((prev) => prev + target);
      // 動畫跑完才顯示結果
      setTimeout(() => {
        setResult({ label: res.label, points: res.pointsWon });
        setSpinning(false);
      }, 4200);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message ?? '轉盤失敗');
      setSpinning(false);
    }
  };

  if (isLoading) {
    return <main className="mx-auto max-w-lg px-4 py-12 text-center text-muted-foreground">載入中…</main>;
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10 space-y-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">🎡 轉盤抽獎</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          每完成一份問卷 +1 次抽獎機會，最高可得 <span className="font-semibold text-amber-600">200 點</span>！
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700">
          🎟️ 剩餘抽獎次數：{status?.availableChances ?? 0}
        </div>
      </div>

      {/* 轉盤 */}
      <div className="relative mx-auto" style={{ width: 280, height: 280 }}>
        {/* 指針 */}
        <div
          className="absolute left-1/2 -top-1 z-10 -translate-x-1/2"
          style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '22px solid #ef4444' }}
        />
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
          }}
        >
          {segments.map((seg, i) => (
            <Wedge key={seg.key} seg={seg} index={i} total={segments.length} />
          ))}
          <circle cx="100" cy="100" r="14" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
        </svg>
      </div>

      {/* 結果 */}
      {result && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-lg font-bold text-amber-700">
            {result.points > 0 ? `🎉 恭喜！${result.label}` : `😅 ${result.label}`}
          </p>
          {result.points > 0 && (
            <p className="text-sm text-amber-600 mt-1">{result.points} 積分已存入錢包</p>
          )}
        </div>
      )}

      {/* 按鈕 */}
      {status?.canSpin ? (
        <button
          onClick={handleSpin}
          disabled={spinning}
          className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-10 py-3 text-base font-bold text-white shadow-lg hover:-translate-y-0.5 transition-transform disabled:opacity-60"
        >
          {spinning ? '轉動中…' : `轉一次（剩 ${status.availableChances} 次）`}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="inline-block rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
            目前沒有抽獎次數 — 完成一份問卷就能再轉！
          </div>
          <div className="flex justify-center gap-3 text-sm">
            <Link href="/tasks" className="text-primary hover:underline">去填問卷賺次數 →</Link>
            <Link href="/mutual" className="text-primary hover:underline">互惠問卷 →</Link>
          </div>
        </div>
      )}

      {/* 獎項說明 */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-left">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">轉盤獎項</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {segments.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              <span>{s.label}</span>
              <span className="text-muted-foreground">({s.weight}%)</span>
            </div>
          ))}
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

  // label 位置
  const mid = start + angle / 2;
  const [lx, ly] = (() => {
    const rad = ((mid - 90) * Math.PI) / 180;
    return [100 + 58 * Math.cos(rad), 100 + 58 * Math.sin(rad)];
  })();

  return (
    <g>
      <path d={path} fill={seg.color} stroke="#fff" strokeWidth="1" />
      <text
        x={lx}
        y={ly}
        fill="#1e293b"
        fontSize="7"
        fontWeight="600"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${mid}, ${lx}, ${ly})`}
      >
        {seg.points > 0 ? `${seg.points}` : '銘謝'}
      </text>
    </g>
  );
}
