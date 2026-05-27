"use client";

import { useEffect, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// SSR 安全的 layout effect:client 用 useLayoutEffect(進場前設好初始態,避免閃爍)
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * GSAP 滾動進場控制器(滾動特效)。
 * 不改動任何 DOM 結構 —— 進站後掃出 `main > section`,
 * 對每個區塊套淡入 + 上移進場;首屏區塊在載入時直接播放。
 * 尊重 prefers-reduced-motion(此時完全不介入,內容維持原樣)。
 */
export function ScrollReveal() {
  useIsomorphicLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("main > section");
      sections.forEach((section, i) => {
        gsap.from(section, {
          opacity: 0,
          y: 28,
          duration: 0.7,
          ease: "power2.out",
          delay: i === 0 ? 0.25 : 0,
          scrollTrigger: {
            trigger: section,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
      });
    });

    // 載入畫面淡出後再校正一次觸發點位置
    const timer = setTimeout(() => ScrollTrigger.refresh(), 120);

    return () => {
      clearTimeout(timer);
      ctx.revert();
    };
  }, []);

  return null;
}
