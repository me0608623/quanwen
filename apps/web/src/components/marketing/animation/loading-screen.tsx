"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Lottie from "lottie-react";
import loadingAnimation from "./loading-animation.json";
import { AnimatedLogo } from "./animated-logo";

const SESSION_KEY = "qw-home-loaded";
const HOLD_MS = 1600;

/**
 * App loading 畫面(Lottie + Framer Motion 淡出)。
 * — 首次進站(每個 session 一次)全螢幕覆蓋,播放 Lottie 旋轉環 + 動畫 Logo,
 *   1.6s 後用 Framer Motion 的 AnimatePresence 淡出。
 * — 回訪者(同 session)只會看到一次極快的淡出,不擋瀏覽。
 */
export function LoadingScreen() {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const seen = typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY);
    if (seen) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* sessionStorage 不可用時忽略 */
      }
      setVisible(false);
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="qw-loading"
          aria-hidden
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[var(--q-canvas)]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <AnimatedLogo size={84} />
          <div className="h-12 w-12">
            {mounted && <Lottie animationData={loadingAnimation} loop autoplay />}
          </div>
          <p className="font-serif text-xs tracking-[0.4em] text-[var(--q-muted)]">
            QUANWEN
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
