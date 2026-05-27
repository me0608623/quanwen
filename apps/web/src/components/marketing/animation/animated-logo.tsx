"use client";

/**
 * 動畫版品牌標記(SVG Animation)
 * — 暗色圓角磚 + 描邊掃出的外框 + 脈動的「券」+ 環繞的雙色光點。
 * 純 SVG + CSS keyframes(定義於 globals.css 的 q-logo-*),無外部依賴。
 * 僅作視覺增強,不取代 nav 既有的文字標記。
 */
export function AnimatedLogo({ size = 88 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="券問 QuanWen"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 暗色磚底 */}
      <rect x="20" y="20" width="80" height="80" rx="18" fill="#181715" />

      {/* 描邊掃出的外框 */}
      <rect
        x="20"
        y="20"
        width="80"
        height="80"
        rx="18"
        fill="none"
        stroke="#cc785c"
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          strokeDasharray: 320,
          strokeDashoffset: 320,
          animation: "q-logo-draw 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        }}
      />

      {/* 環繞的雙色光點 */}
      <g style={{ transformOrigin: "60px 60px", animation: "q-logo-orbit 6s linear infinite" }}>
        <circle cx="60" cy="14" r="3.5" fill="#5db8a6" />
        <circle cx="60" cy="106" r="2.5" fill="#e8a55a" />
      </g>

      {/* 脈動的「券」 */}
      <g style={{ transformOrigin: "60px 64px", animation: "q-logo-pulse 2.2s ease-in-out infinite" }}>
        <text
          x="60"
          y="74"
          textAnchor="middle"
          fontFamily="'Noto Serif TC','PingFang TC','Microsoft JhengHei',serif"
          fontSize="42"
          fontWeight="700"
          fill="#cc785c"
        >
          券
        </text>
      </g>
    </svg>
  );
}
