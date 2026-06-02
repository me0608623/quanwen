#!/usr/bin/env bash
set -euo pipefail

# One-time bootstrap for a fresh hosted PostgreSQL database.
# Yes, using `db:push` on production-ish infra is not the forever answer.
# But until proper versioned migrations land, this is the least stupid way
# to get a brand-new Render Postgres schema into a bootable state.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL 沒設。先 export DATABASE_URL=postgresql://... 再跑。" >&2
  exit 1
fi

cat <<'EOF'
[QuanWen] Fresh Postgres bootstrap
- 只建議用在『全新、空的』Render / hosted PostgreSQL。
- 這會直接把目前 Drizzle schema push 到 DATABASE_URL。
- 正式長期方案仍然應該改成 versioned migrations。
EOF

pnpm --filter api db:push

echo "Schema bootstrap 完成。接著再部署 API，然後檢查 /health、/ready、/api/v1/tags。"
