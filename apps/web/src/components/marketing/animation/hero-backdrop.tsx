"use client";

import { HeroThree } from "./hero-three";
import { ParticleField } from "./particle-field";

/**
 * Hero 背景組合層 —— Three.js 3D 多面體 + Canvas 粒子。
 * 絕對定位填滿 hero、pointer-events-none、置於內容之下(z-0),
 * 不影響任何文字與排版的流向。
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <HeroThree className="absolute -top-8 right-[-34%] h-[44rem] w-[155%] opacity-45 sm:inset-y-0 sm:right-0 sm:h-full sm:w-3/4 sm:opacity-70 lg:w-1/2" />
      <ParticleField className="absolute inset-0 h-full w-full opacity-35 sm:opacity-60" />
      {/* 與下方內容過渡的柔光遮罩,讓暖色畫布不被背景蓋過 */}
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-[var(--q-canvas)]/70 to-[var(--q-canvas)] sm:h-24 sm:via-transparent" />
    </div>
  );
}
