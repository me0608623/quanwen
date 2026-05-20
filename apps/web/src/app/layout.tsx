import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ConditionalNavbar } from '@/components/layout/conditional-navbar';

export const metadata: Metadata = {
  title: '券問 QuanWen — 找到你的受試者',
  description: '雙邊問卷媒合平台，多元獎勵 + AI 品質審核',
  openGraph: {
    title: '券問 QuanWen — 找到你的受試者',
    description: '雙邊問卷媒合平台，多元獎勵 + AI 品質審核',
    type: 'website',
    locale: 'zh_TW',
  },
  twitter: {
    card: 'summary',
    title: '券問 QuanWen — 找到你的受試者',
    description: '雙邊問卷媒合平台，多元獎勵 + AI 品質審核',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <Providers>
          <ConditionalNavbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
