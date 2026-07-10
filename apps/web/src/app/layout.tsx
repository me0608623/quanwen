import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalNavbar } from "@/components/layout/conditional-navbar";
import { DeepLinkHandler } from "@/components/deep-link-handler";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s · 券問 QuanWen",
    default: "券問 QuanWen — 找到你的受試者",
  },
  description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "券問 QuanWen — 找到你的受試者",
    description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
    locale: "zh_TW",
    type: "website",
    siteName: "券問 QuanWen",
  },
  twitter: {
    card: "summary_large_image",
    title: "券問 QuanWen — 找到你的受試者",
    description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
  },
};
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "券問 QuanWen",
  description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
  url: siteUrl,
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "券問 QuanWen",
  description: "雙邊問卷媒合平台，多元獎勵 + AI 品質審核",
  url: siteUrl,
  inLanguage: "zh-TW",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-TW" suppressHydrationWarning>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@500;700&display=swap"
        rel="stylesheet"
      />
      {/* Static export + Capacitor local mode：bridge.js 在 React 之前載入，不再需要 fetch hack */}
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
