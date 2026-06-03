import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: '個人資料', template: '%s · 券問 QuanWen' },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
