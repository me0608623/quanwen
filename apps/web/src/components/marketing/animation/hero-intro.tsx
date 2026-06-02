"use client";

import { useEffect, useLayoutEffect } from "react";
import gsap from "gsap";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function HeroIntro() {
  useIsomorphicLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from("[data-hero-badge]", {
        opacity: 0,
        y: 18,
        duration: 0.45,
      })
        .from(
          "[data-hero-title]",
          {
            opacity: 0,
            y: 28,
            duration: 0.7,
          },
          "-=0.1",
        )
        .from(
          "[data-hero-copy]",
          {
            opacity: 0,
            y: 22,
            duration: 0.55,
            stagger: 0.08,
          },
          "-=0.35",
        )
        .from(
          "[data-hero-cta] > *",
          {
            opacity: 0,
            y: 16,
            scale: 0.96,
            duration: 0.4,
            stagger: 0.09,
          },
          "-=0.25",
        )
        .from(
          "[data-hero-panel]",
          {
            opacity: 0,
            x: 36,
            scale: 0.98,
            duration: 0.75,
          },
          "-=0.55",
        )
        .from(
          "[data-hero-panel-item]",
          {
            opacity: 0,
            y: 14,
            duration: 0.38,
            stagger: 0.08,
          },
          "-=0.45",
        );

      gsap.to("[data-hero-panel]", {
        y: -8,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });

    return () => ctx.revert();
  }, []);

  return null;
}