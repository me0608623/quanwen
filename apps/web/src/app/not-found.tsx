import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <p className="text-6xl font-bold text-primary">404</p>
        <h1 className="mt-3 text-xl font-semibold">找不到此頁面</h1>
        <p className="mt-2 text-sm text-muted-foreground">你要找的頁面不存在，或已被移動。</p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        回到首頁
      </Link>
    </main>
  );
}
