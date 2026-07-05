import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalNavbar } from "@/components/layout/conditional-navbar";
import { DeepLinkHandler } from "@/components/deep-link-handler";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    template: "%s · 券問 QuanWen",
    default: "券問 QuanWen — 找到你的受試者",
  },
  description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
  openGraph: {
    title: "券問 QuanWen — 找到你的受試者",
    description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "券問 QuanWen — 找到你的受試者",
    description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-TW" suppressHydrationWarning>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@500;700&display=swap"
        rel="stylesheet"
      />
      {/* Capacitor bridge 會覆蓋 window.fetch，破壞 React 19 streaming hydration。
          在 hydration 前還原原生 fetch。 */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          if (window.CapacitorWebFetch && window.CapacitorWebFetch !== window.fetch) {
            window.fetch = window.CapacitorWebFetch;
          }
        })();
      `}} />
    </head>
    <body className="font-sans" suppressHydrationWarning><Providers>
      <DeepLinkHandler />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        跳至主要內容
      </a>
      <ConditionalNavbar />
      <div id="main-content" tabIndex={-1} className="outline-none">{children}</div>
    </Providers></body>
  </html>;
}
