"use client";

import { useState, forwardRef } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  showStrength?: boolean;
  value?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showStrength = false, value, className, ...props }, ref) => {
    const [show, setShow] = useState(false);
    const strength = calcStrength(typeof value === "string" ? value : "");

    return (
      <div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <Input
            ref={ref}
            type={show ? "text" : "password"}
            value={value}
            className={cn(
              "h-11 rounded-[10px] border-slate-200 pl-11 pr-11 text-sm focus-visible:border-[#1F6FEB] focus-visible:ring-2 focus-visible:ring-[#1F6FEB]/15",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "隱藏密碼" : "顯示密碼"}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {showStrength && typeof value === "string" && value.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i <= strength.score ? strength.color : "bg-slate-200"
                  )}
                />
              ))}
            </div>
            <p className={cn("mt-1.5 text-[11px] font-medium", strength.textColor)}>
              {strength.label}
            </p>
          </div>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

function calcStrength(pwd: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  textColor: string;
} {
  if (!pwd) return { score: 0, label: "", color: "", textColor: "" };

  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;

  if (pwd.length < 8) {
    return { score: 1, label: "太短 · 至少 8 字", color: "bg-red-500", textColor: "text-red-600" };
  }
  const map = [
    { label: "", color: "", textColor: "" },
    { label: "弱 · 建議加長或加數字符號", color: "bg-red-500", textColor: "text-red-600" },
    { label: "普通 · 可再加強", color: "bg-amber-500", textColor: "text-amber-600" },
    { label: "好 · 密碼強度足夠", color: "bg-emerald-500", textColor: "text-emerald-600" },
    { label: "極強 · 完美", color: "bg-emerald-600", textColor: "text-emerald-700" },
  ];
  return { score: score as 1 | 2 | 3 | 4, ...map[score] };
}
