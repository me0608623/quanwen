import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalNavbar } from "@/components/layout/conditional-navbar";

const cormorant = Cormorant_Garamond({ subsets:["latin"], weight:["500","600"], variable:"--font-serif-latin" });
const notoSerifTc = Noto_Serif_TC({ subsets:["latin"], weight:["500","700"], variable:"--font-serif-cjk" });
const inter = Inter({ subsets:["latin"], weight:["400","500","600"], variable:"--font-sans-latin" });
const notoSansTc = Noto_Sans_TC({ subsets:["latin"], weight:["400","500","700"], variable:"--font-sans-cjk" });

export const metadata: Metadata = {
  title: "券問 QuanWen — 找到你的受試者",
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
  return <html lang="zh-TW" suppressHydrationWarning><body className={`${cormorant.variable} ${notoSerifTc.variable} ${inter.variable} ${notoSansTc.variable} font-sans`} suppressHydrationWarning><Providers><ConditionalNavbar />{children}</Providers></body></html>;
}
