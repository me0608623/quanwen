# QuanWen — CLAUDE.md

## 專案根目錄結構

```
問券/                          ← Obsidian Vault + git root
├── CLAUDE.md                  ← 這個檔案
├── 00-首頁/  …  13-系統深度設計/  ← 設計藍圖 (SSOT)
└── quanwen/                   ← 實作 code ★
    ├── apps/
    │   ├── web/               ← Next.js 14
    │   └── api/               ← NestJS (WIP)
    ├── pnpm-workspace.yaml
    └── package.json
```

> **啟動方式:** 在 `問券/` 執行 `claude`，即可讀到此 CLAUDE.md 和所有設計藍圖。
> 跑 dev server: `cd quanwen && pnpm --filter web dev`

---

Monorepo: `apps/api` (NestJS + Drizzle) + `apps/web` (Next.js 14 App Router)

## Setup Checklist (Next.js)

When bootstrapping or diagnosing a missing-styles issue, verify ALL of these exist in `apps/web/`:

- [ ] `postcss.config.mjs` — **required** for Tailwind to compile; without it `@tailwind` directives are ignored
- [ ] `tailwind.config.ts` — must have `content` covering `./src/app/**` and `./src/components/**`
- [ ] `src/app/globals.css` — must contain `@tailwind base/components/utilities`
- [ ] `src/app/layout.tsx` — must `import './globals.css'`

After adding or changing any of the above, clear the build cache before restarting:

```bash
rm -rf apps/web/.next
pnpm --filter web dev
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Tailwind CSS v3, shadcn/ui, React Hook Form + Zod |
| Backend | NestJS, Drizzle ORM, PostgreSQL |
| Auth | JWT + Google OAuth (Passport.js) |
| Monorepo | pnpm workspaces |

## Key Conventions

- Auth pages live at `apps/web/src/app/auth/<name>/page.tsx` (not a route group)
- Shared auth components: `apps/web/src/app/auth/_components/`
- Root `layout.tsx` renders `<Navbar>` — hide it on `/auth/*` via `usePathname()`
- API runs on port `3001`, web on port `3000`
