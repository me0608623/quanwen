"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

// 金色 base（暖金）
const GOLD = "212, 175, 95";

/**
 * 淡淡金色海浪漣漪 — 數條平滑正弦波線由左而右緩緩流動。
 * - 不是密集粒子，而是低透明度的金色波形線（漣漪感）。
 * - 描邊用左透明→右淡金的水平漸層，右側金色略濃。
 * - 相位由 GSAP 驅動，gsap.ticker 每幀重繪；sin 對 t 以 2π 為週期，循環無縫。
 * - 尊重 prefers-reduced-motion（只畫靜態單格）。
 * 置於容器背後（pointer-events-none），不影響排版。
 */
export function GoldWave({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const phase = { t: 0 };

    const LINES = 5;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawLine = (i: number, t: number) => {
      const frac = i / (LINES - 1); // 0 → 1
      const baseY = height * (0.32 + frac * 0.46);
      const amp = height * 0.05 * (0.7 + frac * 0.7);
      // 波長隨層略異，視覺更自然；sin 對 t 仍以 2π 為週期 → 無縫
      const k = (Math.PI * 2) / (width * (0.6 + frac * 0.3));
      const offset = i * 1.3;

      // 左透明 → 右淡金（右側略濃）
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, `rgba(${GOLD}, 0)`);
      grad.addColorStop(0.5, `rgba(${GOLD}, ${0.18 + frac * 0.06})`);
      grad.addColorStop(1, `rgba(${GOLD}, ${0.4 + frac * 0.1})`);

      ctx.save();
      // 金色 glow：讓細線在深底上發光，呈現淡淡漣漪而非死板線條
      ctx.shadowColor = `rgba(${GOLD}, 0.5)`;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      for (let x = 0; x <= width; x += 6) {
        const u = k * x - t;
        // 主波 + 二次諧波（整數倍 → 對 t 仍 2π 週期，循環無縫）
        const y = baseY + Math.sin(u + offset) * amp + Math.sin(2 * u + offset) * amp * 0.22;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const t = phase.t;
      for (let i = 0; i < LINES; i++) drawLine(i, t);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw();
    });
    ro.observe(canvas);

    let tween: gsap.core.Tween | null = null;
    if (reduce) {
      draw(); // 靜態單格
    } else {
      gsap.ticker.add(draw);
      // 相位 0 → 2π 無限循環，緩慢（淡淡漣漪）
      tween = gsap.to(phase, { t: Math.PI * 2, duration: 9, ease: "none", repeat: -1 });
    }

    return () => {
      tween?.kill();
      gsap.ticker.remove(draw);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
