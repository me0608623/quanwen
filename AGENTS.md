# QuanWen — AGENTS.md

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
- API runs on port `3001`, web on port `3000` (本機 docker dev)

## Production Deployment (LIVE, 已上線 2026-06-06)

正式環境已部署到雲端，**不再依賴本機 docker / Cloudflare tunnel**：

| Layer | Host | URL |
|-------|------|-----|
| Frontend | **Vercel** | https://quanwen.vercel.app |
| API | **Render** (free, Singapore) | https://quanwen-api.onrender.com |
| DB | **Neon** serverless Postgres | ap-southeast-1 |

- **更新 API**：Render 跑 Docker Hub image（repo 是 private、未連 git）。流程：`docker compose -f docker-compose.yml -f docker-compose.full.yml build api` → `docker tag quanwen-api:latest me0608623/quanwen-api:latest && docker push me0608623/quanwen-api:latest` → 觸發 `POST https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys`。
- **更新前端**：Vercel 專案**沒連 git**，只能從 repo 根 `vercel --prod --yes --scope 409500476s-projects`（從 `apps/web` 跑會失敗）。`NEXT_PUBLIC_*` 是 build-time，改 env 後要重部署。
- **密鑰**：`source /home/aa/.config/quanwen/secrets.env`（repo 外、chmod 600）→ `$RENDER_API_KEY`、`$RENDER_SERVICE_ID`、`$NEON_DATABASE_URL`。**切勿把金鑰明文寫進 repo 內檔案**（會進 git）。
- OAuth：Google + LINE 已上線（Apple 隱藏）；正式 admin = `me0608623@gmail.com`（Google 登入）。
- 細節見 `CLAUDE.md` 的「正式環境部署（LIVE）」段。
