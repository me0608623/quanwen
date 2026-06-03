# Quanwen Deployment Status

**Last updated**: 2026-06-02

## Live Services

| Service | URL | Status |
|---------|-----|--------|
| Frontend (Vercel) | https://quanwen.vercel.app | ✅ Production |
| API (Cloudflare Quick Tunnel) | URL changes on restart, check `/tmp/cf-tunnel.log` | ✅ Running |
| PostgreSQL | localhost:5432 (Docker) | ✅ Healthy |
| Redis | localhost:6379 (Docker) | ✅ Healthy |

## Auto-Recovery

- **Docker stack**: `@reboot` crontab auto-starts on boot
- **Cloudflare Tunnel**: `cf-tunnel.sh` auto-restarts on failure, updates Vercel env on URL change
- **Health monitor**: every 5 min → `/tmp/quanwen-health.log`

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.full.yml` | API + Web + DB + Redis stack |
| `~/cf-tunnel.sh` | Tunnel with auto-restart + Vercel env sync |
| `~/quanwen-health-monitor.sh` | 5-min health checks |
| `~/setup-named-tunnel.sh` | Upgrade to persistent Cloudflare Named Tunnel |
| `~/quanwen-netlify-deploy.sh` | Deploy frontend to Netlify |
| `render.yaml` | API deployment config for Render |

## Known Issues

1. **Quick Tunnel URL not persistent** — changes on restart. `cf-tunnel.sh` handles auto-update but there's a brief downtime during URL change.
2. **Solution**: Set up Cloudflare Named Tunnel for permanent URL (free). Run `CF_API_TOKEN=xxx bash ~/setup-named-tunnel.sh`.

## Pending Enhancements

- [ ] Cloudflare Named Tunnel (persistent URL)
- [ ] Netlify as alternative frontend host
- [ ] Render free tier for API (needs external DB)

## Manual Commands

```bash
# Check current tunnel URL
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf-tunnel.log | head -1

# Restart tunnel
pkill -f cloudflared; bash ~/cf-tunnel.sh &

# Restart Docker stack
cd ~/projects/quanwen && docker compose -f docker-compose.yml -f docker-compose.full.yml restart

# View health log
cat /tmp/quanwen-health.log

# Deploy frontend to Vercel (after code changes)
cd ~/projects/quanwen && vercel deploy --prod --yes
```
