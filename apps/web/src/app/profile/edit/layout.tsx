import type { Metadata } from 'next';

export const metadata: Metadata = { title: '編輯個人資料' };

export default function ProfileEditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
