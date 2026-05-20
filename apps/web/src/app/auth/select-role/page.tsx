"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClipboardList, PenTool, Check, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSelectRole } from "@/hooks/use-auth";
import { setToken } from "@/lib/token";
import { extractApiError } from "@/lib/extract-error";
import { cn } from "@/lib/cn";
import { AuthShell } from "../_components/auth-shell";

type Role = "respondent" | "surveyor";

function SelectRoleForm() {
  const searchParams = useSearchParams();
  const selectRole = useSelectRole();
  const [initialized, setInitialized] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [selected, setSelected] = useState<Role | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setToken(token);
      setHasToken(true);
      const nameParam = searchParams.get("name");
      if (nameParam) {
        try {
          setDisplayName(decodeURIComponent(nameParam).slice(0, 100));
        } catch {
          // ignore malformed URI encoding
        }
      }
    }
    setInitialized(true);
  }, [searchParams]);

  if (!initialized) {
    return (
      <AuthShell variant="compact">
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#1F6FEB]" />
        </div>
      </AuthShell>
    );
  }

  if (!hasToken) {
    return (
      <AuthShell variant="compact">
        <div className="text-center">
          <p className="mb-4 text-sm text-red-600">連結無效或已過期，請重新登入。</p>
          <Link href="/auth/login" className="text-sm font-semibold text-[#1F6FEB] hover:underline">
            返回登入頁面
          </Link>
        </div>
      </AuthShell>
    );
  }

  const handleContinue = () => {
    if (!selected) return;
    selectRole.mutate({ role: selected, displayName: displayName.trim() || undefined });
  };

  return (
    <AuthShell variant="compact">
      <div className="mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[2px] text-[#1F6FEB]">
          STEP 2 / 3
        </p>
        <h2 className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900">
          你想用券問做什麼?
        </h2>
        <p className="text-sm text-slate-500">
          選一個身份開始，日後可隨時切換或同時擁有兩個身份。
        </p>
      </div>

      <div className="mb-5">
        <Label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold text-slate-900">
          你的暱稱 <span className="text-slate-400 font-normal">（之後可修改）</span>
        </Label>
        <div className="relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="輸入你的名字或暱稱"
            maxLength={100}
            className="h-11 rounded-[10px] border-slate-200 pl-11 text-sm focus-visible:border-[#1F6FEB] focus-visible:ring-2 focus-visible:ring-[#1F6FEB]/15"
          />
        </div>
      </div>

      <div className="grid gap-3">
        <RoleCard
          icon={<ClipboardList className="h-6 w-6" />}
          title="我要填問卷"
          subtitle="受試者"
          features={["瀏覽符合自己的問卷任務", "完成後賺現金 / 7-11 禮券 / 積分", "累積信譽分解鎖更好任務"]}
          color="emerald"
          selected={selected === "respondent"}
          onSelect={() => setSelected("respondent")}
        />
        <RoleCard
          icon={<PenTool className="h-6 w-6" />}
          title="我要發問卷"
          subtitle="問券方"
          features={["建立問卷，平台幫你找對的人填", "AI 自動審核確保資料品質", "即時 Dashboard + 結案 PDF 報告"]}
          color="blue"
          selected={selected === "surveyor"}
          onSelect={() => setSelected("surveyor")}
        />
      </div>

      {selectRole.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {extractApiError(selectRole.error, "選擇失敗，請重試")}
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!selected || selectRole.isPending}
        className="mt-6 h-[46px] w-full rounded-[10px] bg-[#1F6FEB] text-base font-bold text-white shadow-sm transition-all hover:bg-[#0F2A5C] hover:shadow-lg hover:shadow-[#1F6FEB]/25 active:translate-y-px disabled:opacity-50"
      >
        {selectRole.isPending ? "處理中…" : "繼續下一步 →"}
      </Button>
    </AuthShell>
  );
}

interface RoleCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  features: string[];
  color: "blue" | "emerald";
  selected: boolean;
  onSelect: () => void;
}

function RoleCard({ icon, title, subtitle, features, color, selected, onSelect }: RoleCardProps) {
  const accent = {
    blue: {
      border: "border-[#1F6FEB]", bg: "bg-[#EAF2FF]",
      iconBg: "bg-[#1F6FEB]", tagBg: "bg-[#DBEAFE]", tagText: "text-[#1E40AF]",
    },
    emerald: {
      border: "border-emerald-500", bg: "bg-emerald-50",
      iconBg: "bg-emerald-500", tagBg: "bg-emerald-100", tagText: "text-emerald-700",
    },
  }[color];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative w-full rounded-2xl border-2 p-5 text-left transition-all",
        selected
          ? `${accent.border} ${accent.bg}`
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white", accent.iconBg)}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", accent.tagBg, accent.tagText)}>
              {subtitle}
            </span>
          </div>
          <ul className="space-y-1 text-xs text-slate-600">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Check className="h-3 w-3 flex-shrink-0 text-slate-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        {selected && (
          <div className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white", accent.iconBg)}>
            <Check className="h-4 w-4" />
          </div>
        )}
      </div>
    </button>
  );
}

export default function SelectRolePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#1F6FEB]" />
      </div>
    }>
      <SelectRoleForm />
    </Suspense>
  );
}
