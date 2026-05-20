"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/cn";

export type Role = "respondent" | "surveyor";

interface RoleToggleProps {
  value: Role;
  onChange: (role: Role) => void;
}

const SOUND_PREF_KEY = "qwen_role_toggle_sound";

export function RoleToggle({ value, onChange }: RoleToggleProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(SOUND_PREF_KEY);
    if (raw === "off") setSoundEnabled(false);
  }, []);

  const playTone = (role: Role) => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = role === "surveyor" ? "triangle" : "sine";
      osc.frequency.value = role === "surveyor" ? 560 : 430;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);

      window.setTimeout(() => {
        void ctx.close();
      }, 220);
    } catch {
      // best effort only
    }
  };

  const handleToggle = (nextRole: Role) => {
    if (nextRole === value) return;
    playTone(nextRole);
    onChange(nextRole);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => handleToggle("respondent")}
          className={cn(
            "rounded-md px-3 py-2.5 text-sm font-semibold transition-all",
            value === "respondent" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          我要填問券
        </button>
        <button
          type="button"
          onClick={() => handleToggle("surveyor")}
          className={cn(
            "rounded-md px-3 py-2.5 text-sm font-semibold transition-all",
            value === "surveyor" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          我要發問券
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label={soundEnabled ? "關閉角色切換音效" : "開啟角色切換音效"}
        >
          {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          切換音效
        </button>
      </div>
    </div>
  );
}
