import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">券問 QuanWen</h1>
        <p className="mt-2 text-muted-foreground">雙邊問卷媒合平台 — 找到你的受試者</p>
      </div>

      <div className="flex gap-4">
        <Link
          href="/auth/login"
          className="rounded-md bg-primary px-6 py-2 text-primary-foreground hover:opacity-90 transition-opacity"
        >
          登入
        </Link>
        <Link
          href="/auth/register"
          className="rounded-md border border-primary px-6 py-2 text-primary hover:bg-secondary transition-colors"
        >
          註冊
        </Link>
      </div>
    </main>
  );
}
