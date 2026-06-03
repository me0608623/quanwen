import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: '積分商城', template: '%s · 券問 QuanWen' },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
