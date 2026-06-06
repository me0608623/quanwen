import Link from "next/link";

const footerColumns = [
  {
    title: "產品",
    links: [
      { href: "/features", label: "產品優勢" },
      { href: "/solutions", label: "解決方案" },
      { href: "/integrations", label: "整合" },
      { href: "/pricing", label: "價格" },
    ],
  },
  {
    title: "公司",
    links: [
      { href: "/about", label: "關於我們" },
      { href: "/contact", label: "聯絡我們" },
    ],
  },
  {
    title: "資源",
    links: [
      { href: "/faq", label: "常見問題" },
      { href: "/blog", label: "部落格" },
      { href: "/developers", label: "開發者" },
    ],
  },
  {
    title: "法務",
    links: [
      { href: "/terms", label: "服務條款" },
      { href: "/privacy", label: "隱私權政策" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-[var(--q-surface-dark)] text-[var(--q-on-dark-soft)]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {footerColumns.map((column) => (
          <div key={column.title}>
            <p className="mb-3 text-sm font-semibold text-[var(--q-on-dark)]">{column.title}</p>
            <div className="space-y-2 text-sm">
              {column.links.map((link) => (
                <div key={link.href}>
                  <Link href={link.href} className="transition hover:text-[var(--q-on-dark)]">
                    {link.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs">
        © 2026 券問 QuanWen · 為真實數據而生 · 綠界 ECPay 金流託管
      </div>
    </footer>
  );
}
