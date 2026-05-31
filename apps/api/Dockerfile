# Phase F.5: API Dockerfile（dev + prod 同 image，build 階段不同）
# Multi-stage build to keep prod image lean
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ─── deps stage：只裝 node_modules，cache 友善 ──
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter api

# ─── builder stage：編譯 NestJS ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig*.json ./
COPY apps/api ./apps/api
RUN pnpm --filter api build

# ─── runner stage：lean runtime ──
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
ENV NODE_ENV=production
# Run as non-root to reduce blast radius of any runtime exploit
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
USER nestjs
EXPOSE 3001
CMD ["node", "dist/main.js"]
