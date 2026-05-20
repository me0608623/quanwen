"use client";

import { useState } from "react";
import Link from "next/link";
import { useLogin } from "@/hooks/use-auth";
import { extractApiError } from "@/lib/extract-error";
import { GoogleLogo, AppleLogo, LineLogo } from "@/components/icons/oauth-logos";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type Role = "respondent" | "surveyor";

export default function LoginPage() {
  const [role, setRole] = useState<Role>("respondent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(false);
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ email, password });
  };

  const handleOAuth = (provider: "google" | "apple" | "line") => {
    window.location.href = `${API_URL}/auth/${provider}`;
  };

  return (
    <div className="lp-shell">

      {/* ============ Left: Brand ============ */}
      <div className="lp-brandPanel">
        <div className="lp-brandTop">
          <div className="lp-brandMark">券</div>
          <div className="lp-brandName">
            券問
            <span className="lp-brandSub">QUANWEN</span>
          </div>
        </div>

        <div className="lp-brandHero">
          <div className="lp-badge">
            <span className="lp-dot" />
            Closed Beta · 招募中
          </div>
          <h1 className="lp-heroTitle">
            讓問卷變成<br />
            有<span className="lp-accent">獎勵</span>且有<span className="lp-accent">品質</span>的<br />
            雙邊市場
          </h1>
          <p className="lp-heroDesc">
            研究生、店家、品牌找不到對的人填問卷；<br />
            一般人填了問卷沒回饋。我們用 AI 品質審核 + 在地禮券，<br />
            讓供需雙方都不再吃虧。
          </p>

          <div className="lp-brandFeatures">
            <div className="lp-featureItem">
              <div className="lp-featureIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                </svg>
              </div>
              <div>
                <div className="lp-featureTitle">精準媒合</div>
                <div className="lp-featureDesc">標籤 + 信譽分，推薦真的符合的問卷</div>
              </div>
            </div>
            <div className="lp-featureItem">
              <div className="lp-featureIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              </div>
              <div>
                <div className="lp-featureTitle">AI 品質審核</div>
                <div className="lp-featureDesc">三層管線，擋掉亂填，保證真實</div>
              </div>
            </div>
            <div className="lp-featureItem">
              <div className="lp-featureIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/>
                  <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                </svg>
              </div>
              <div>
                <div className="lp-featureTitle">三軌獎勵</div>
                <div className="lp-featureDesc">現金、7-11 禮券、平台積分任選</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-brandFoot">
          © 2026 QuanWen Inc. · 讓問卷變成有價值的雙邊市場
        </div>
      </div>

      {/* ============ Right: Form ============ */}
      <div className="lp-formPanel">
        <div className="lp-formWrap">

          <div className="lp-formHead">
            <h2>登入券問</h2>
            <p>還沒有帳號？<Link href="/auth/register">立即註冊 →</Link></p>
          </div>

          <div className="lp-roleToggle">
            <button
              type="button"
              className={`lp-roleBtn ${role === "respondent" ? "lp-roleBtnActive" : ""}`}
              onClick={() => setRole("respondent")}
            >
              我要填問卷
            </button>
            <button
              type="button"
              className={`lp-roleBtn ${role === "surveyor" ? "lp-roleBtnActive" : ""}`}
              onClick={() => setRole("surveyor")}
            >
              我要發問卷
            </button>
          </div>

          <div className="lp-oauthGroup">
            <button type="button" className="lp-oauthBtn" onClick={() => handleOAuth("google")}>
              <GoogleLogo size={18} />
              使用 Google 登入
            </button>
            <button type="button" className="lp-oauthBtn lp-oauthApple" onClick={() => handleOAuth("apple")}>
              <AppleLogo size={18} />
              使用 Apple 登入
            </button>
            <button type="button" className="lp-oauthBtn lp-oauthLine" onClick={() => handleOAuth("line")}>
              <LineLogo size={18} />
              使用 LINE 登入
            </button>
          </div>

          <div className="lp-divider">或使用 EMAIL 登入</div>

          <form onSubmit={handleSubmit}>
            <div className="lp-formField lp-withIcon">
              <label htmlFor="email">Email</label>
              <svg className="lp-fieldIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <input
                id="email" type="text" placeholder="you@example.com"
                autoComplete="username" required
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="lp-formField lp-withIcon">
              <label htmlFor="password">密碼</label>
              <svg className="lp-fieldIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="至少 8 字"
                autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="lp-fieldToggle"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "隱藏密碼" : "顯示密碼"}
              >
                {showPwd ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                    <line x1="2" y1="2" x2="22" y2="22"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            <div className="lp-rowBetween">
              <label className="lp-checkboxWrap">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                記住我
              </label>
              <Link href="/auth/forgot-password" className="lp-forgotLink">忘記密碼？</Link>
            </div>

            {loginMutation.error && (
              <p className="lp-errorMsg">
                {extractApiError(loginMutation.error, "登入失敗，請再試一次")}
              </p>
            )}

            <button type="submit" className="lp-btnSubmit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "登入中…" : "登入"}
            </button>
          </form>

          <div className="lp-footNote">
            登入即表示同意 <Link href="/terms">服務條款</Link> 與 <Link href="/privacy">隱私政策</Link>。<br />
            我們不會儲存你的密碼明文 · 全程 HTTPS 加密。
          </div>

        </div>
      </div>

    </div>
  );
}
