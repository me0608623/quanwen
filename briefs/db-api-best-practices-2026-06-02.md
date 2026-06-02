# QuanWen DB / API Best Practices Brief

Date: 2026-06-02
Related issues: QUA-268, QUA-264, QUA-265, QUA-270

## 1. Current stack

Source of truth checked in repo:
- `README.md`
- `apps/api/package.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/db/database.module.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/common/throttler/redis-throttler.storage.ts`

Current stack:
- Monorepo: pnpm workspaces
- Frontend: Next.js 14 App Router
- Backend: NestJS 11 on Express 5
- ORM: Drizzle ORM + drizzle-kit
- Primary DB: PostgreSQL via `pg`
- Dev/test DB fallback: `@electric-sql/pglite`
- Validation: Zod
- Rate limiting: `@nestjs/throttler`
- Distributed throttle storage: custom Redis-backed storage using optional `ioredis`

Bottom line: this is a sane stack. No rewrite needed. Anyone suggesting one should be supervised.

## 2. DB optimization findings

### What is already good

1. The codebase already exposes connection-pool knobs in `database.module.ts`:
   - `DB_POOL_MAX` default `10`
   - `DB_POOL_IDLE_TIMEOUT_MS` default `30000`
   - `DB_POOL_CONNECTION_TIMEOUT_MS` default `2000`

2. Hot-path indexes already exist in schema and SQL rollout files.
   Examples found:
   - `survey_responses(survey_id)`
   - `survey_responses(respondent_id)`
   - `survey_responses(survey_id, status, submitted_at)`
   - `response_answers(response_id)`
   - `response_answers(question_id)`
   - `response_answers(survey_id, question_id)`
   - survey/status/category indexes called out in prior review docs

3. Prior engineering work already optimized one obvious CPU-side bottleneck in export flow and added DB indexes for response/export paths.

### Best-practice recommendations

1. Add indexes for real access paths, not because indexes feel productive.
   Priority order:
   - foreign keys used in joins
   - filters used in high-volume endpoints
   - sort keys used in paginated endpoints
   - uniqueness constraints enforcing business rules

2. Prefer composite indexes that match real WHERE + ORDER BY patterns.
   The next candidates worth validating with `EXPLAIN ANALYZE` are:
   - `surveys(status, type, reward_points DESC, published_at DESC)` for task/feed style listing
   - `notifications(user_id, created_at DESC)` for user notification feed
   - `transactions(user_id, type, created_at DESC)` if wallet history commonly filters by type

3. Use partial indexes for skewed states.
   Good candidates:
   - submitted responses only
   - published surveys only
   - active point shop items only

4. For large production tables, create indexes safely:
   - `CREATE INDEX CONCURRENTLY`
   - outside transaction-wrapped migration steps
   - verify write amplification and dead index risk afterwards

5. Watch for service-layer N+1, because with Drizzle the ORM is not the villain; loops are.
   Review hotspots for:
   - per-row lookups inside loops
   - repeated counts/aggregates
   - duplicate user/profile fetches

6. Add slow-query observability.
   Recommended minimum:
   - log SQL slower than 200–500 ms
   - include route, requestId, duration, and caller context
   Without this, DB tuning becomes horoscope reading with SQL keywords.

## 3. Connection pooling guidance

Current defaults are fine for dev. Production needs deliberate sizing.

Recommended baseline:
- pool size per API instance: 10–20 to start
- `connectionTimeoutMillis`: 2s is correct; fail fast beats hanging like a depressed progress bar
- `idleTimeoutMillis`: 30s is reasonable

Rules that matter:
1. Size by total deployment, not one process in isolation.
   Formula:
   - total DB connections = instance count × pool max + migration/admin headroom

2. Never let app pools consume all Postgres connection budget.
   Leave room for:
   - migrations
   - admin access
   - scheduled jobs
   - analytics/export tasks
   - monitoring

3. If the app scales horizontally, add PgBouncer before inflating per-instance pools.
   Transaction pooling mode is the right default here.

4. Isolate long-running jobs from request traffic where possible.
   Export/import/report jobs should not fight web requests for the same tiny pool.

5. Monitor these metrics before changing anything:
   - pool saturation
   - wait time to acquire connection
   - p95 query latency
   - slow transaction count
   - total Postgres connections across instances

## 4. API error-handling best practices

### What is already good

`GlobalExceptionFilter` already does several things right:
- one JSON envelope for failures
- includes `statusCode`, `requestId`, `timestamp`, and `path`
- logs 5xx with stack traces server-side
- avoids dumping raw internals to clients unless explicitly shaped upstream

`main.ts` also injects and returns `x-request-id`, and logs request metadata on response finish.

### Recommendations

1. Keep one canonical error envelope.
   Recommended shape:
   - `success: false`
   - `statusCode`
   - `message`
   - `code` for machine-readable domain errors
   - `details` for validation/business metadata
   - `requestId`
   - `timestamp`
   - `path`

2. Standardize domain error codes instead of making every service improvise.
   Suggested examples:
   - `AUTH_INVALID_TOKEN`
   - `SURVEY_NOT_PUBLISHED`
   - `DUPLICATE_RESPONSE`
   - `RATE_LIMIT_EXCEEDED`
   - `KYC_REQUIRED`
   - `INSUFFICIENT_BALANCE`

3. Normalize validation failures into a stable `details` structure.
   Clients should not have to guess whether the payload is an array today and a string tomorrow because someone got creative.

4. Distinguish operational errors from programmer errors.
   - 4xx: expected user/domain failures
   - 5xx: bugs, infra issues, upstream failures

5. Map upstream failures explicitly:
   - timeout -> 504 or 503
   - dependency unavailable -> 503
   - malformed upstream response -> 502

6. Alert on repeated 5xx bursts and throttling spikes.
   Pretty error envelopes with zero monitoring are just decorative plumbing.

## 5. Rate limiting libraries and strategy

### Current library choice

The current choice is the correct one for this stack:
- `@nestjs/throttler`
- global `ThrottlerGuard`
- custom Redis-backed storage via `RedisThrottlerStorage`
- in-memory fallback when Redis is missing or broken

This is the right answer. `express-rate-limit` would be redundant here.

### Why the current approach is good

1. Nest-native integration is cleaner than bolting on generic Express middleware.
2. Redis-backed counters work across multiple API instances.
3. The custom storage has a non-stupid fallback path:
   - Redis missing/broken -> degrade to in-memory throttling
   - not "oops, rate limiting vanished"
4. The current tiered config is already sensible:
   - short: 10 req / 1 sec
   - medium: 100 req / 60 sec

### Best-practice recommendations

1. Keep Redis-backed counters for production multi-instance deployments.
   In-memory fallback is fine for dev, not a real production strategy.

2. Add stricter route-level throttles for abuse-prone endpoints:
   - login
   - password reset
   - OTP / mail send
   - AI generation
   - export/import
   - public search endpoints

3. Use identity keys carefully:
   - authenticated -> user ID
   - anonymous -> IP
   - costly actions -> route-specific composite key

4. For expensive endpoints, combine rate limits with quotas and concurrency caps.
   Requests-per-minute alone will not save you from someone turning AI endpoints into a budget bonfire.

5. Only consider `rate-limiter-flexible` if you outgrow Nest throttler and need advanced distributed quota logic beyond the current guard model.
   Right now, that would be engineering cosplay.

## 6. Concrete next actions for engineering

1. Run `EXPLAIN ANALYZE` on hottest survey listing, notifications, wallet history, and response export queries.
2. Add only evidence-backed composite or partial indexes.
3. Log slow SQL with `requestId` correlation.
4. Standardize domain error `code` and validation `details` across services.
5. Ensure production always has Redis enabled for throttling.
6. Add tighter per-route throttles for auth, AI, import, and export endpoints.
7. Re-check total Postgres connection budget before increasing pool sizes.

## Bottom line

QuanWen already has the right bones: NestJS, Drizzle, PostgreSQL, pooling knobs, a global exception filter, request IDs, and Redis-aware throttling. The next wins are boring and that’s good: measure real query paths, add a few evidence-backed indexes, tighten error contracts, and stop expensive endpoints from acting like an open bar.