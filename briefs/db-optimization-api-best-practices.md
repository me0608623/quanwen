# Research Brief: DB Optimization & API Best Practices for QuanWen Stack

**Author:** Researcher Agent  
**Date:** 2026-06-02  
**Issue:** QUA-268  
**Stack:** NestJS 11 + Drizzle ORM 0.45 + PostgreSQL + Redis (ioredis)

---

## 1. Current Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| API Framework | NestJS | ^11.1.24 |
| ORM | Drizzle ORM | ^0.45.2 |
| Database | PostgreSQL (node-postgres/pg) | ^8.21.0 |
| Cache/Queue | Redis (ioredis) | ^5.11.0 |
| Rate Limiting | @nestjs/throttler | ^6.5.0 (Redis-backed) |
| Validation | Zod | ^4.4.3 |
| Auth | Passport.js (JWT + Google OAuth) | — |
| Testing | Vitest + PGlite (in-memory PG) | ^4.1.7 |
| Monorepo | pnpm workspaces | — |

**16 schema files** defining ~25 tables across: users, oauth, profiles, surveys, responses, notifications, wallet/transactions, journal entries, tags, KYC, point-shop, mutual, spin, AI audit, daily usage, and survey logic rules.

---

## 2. Schema Optimization Recommendations

### 2.1 Indexing — Current State & Gaps

**Already well-indexed (good):**
- `users`: email, role, status, password_reset_token, email_verification_token
- `surveys`: surveyor_id, status, expires_at, composite (status, type), category
- `survey_responses`: survey_id, respondent_id, composite (respondent_id, status), composite (survey_id, status), unique (survey_id, respondent_id)
- `response_answers`: response_id, question_id, composite (survey_id, question_id)
- `transactions`: user_id, status, type, composite (user_id, created_at), unique external ref
- `notifications`: user_id, composite (user_id, is_read)

**Gaps to address:**

| Table | Missing Index | Impact | Recommendation |
|-------|-------------|--------|----------------|
| `surveys` | `(status, reward_points, published_at)` | Task list sorted by reward | Add composite for `ORDER BY reward_points DESC, published_at DESC` hot path |
| `notifications` | `(user_id, created_at DESC)` | User notification feed pagination | Add for paginated notification list queries |
| `transactions` | `(user_id, type, created_at DESC)` | Filtered wallet history | Add if type-filtered history queries are common |
| `wallets` | None needed | Single-row per user | OK — `userId` is UNIQUE already |
| `survey_responses` | `(submitted_at)` | Admin analytics date-range queries | Partial index `WHERE status = 'submitted'` for analytics |

**Recommendation:** Add the following Drizzle index definitions:

```typescript
// surveys.ts — optimized task list ordering
rewardPublishedIdx: index('surveys_reward_published_idx').on(t.status, t.rewardPoints, t.publishedAt),

// notifications.ts — paginated feed
userCreatedIdx: index('notifications_user_created_idx').on(t.userId, t.createdAt),

// responses.ts — analytics on submitted only (use SQL migration for partial)
// CREATE INDEX CONCURRENTLY survey_responses_submitted_at_idx
//   ON survey_responses (submitted_at) WHERE status = 'submitted';
```

### 2.2 Connection Pooling

**Current:** Default `pg.Pool` with `drizzle-orm/node-postgres`.

**Recommendations:**

1. **Explicit pool configuration** (currently relying on defaults):
   ```typescript
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 20,                    // max connections (default 10)
     idleTimeoutMillis: 30_000,  // close idle connections after 30s
     connectionTimeoutMillis: 5_000,
   });
   ```

2. **Production:** Put PgBouncer in front of PostgreSQL in transaction pooling mode.
   - Drizzle ORM works cleanly with PgBouncer (no session-level features used).
   - Add to `docker-compose.full.yml`:
     ```yaml
     pgbouncer:
       image: edoburu/pgbouncer:latest
       environment:
         DATABASE_URL: postgres://quanwen:quanwen@postgres:5432/quanwen_dev
         POOL_MODE: transaction
         MAX_CLIENT_CONN: 100
         DEFAULT_POOL_SIZE: 25
       ports:
         - '6432:5432'
     ```

3. **Pool monitoring:** Add a health check endpoint that reports pool stats:
   ```typescript
   // pool.totalCount, pool.idleCount, pool.waitingCount
   ```

### 2.3 Query Optimization Patterns

1. **Use Drizzle's `eq` + `and` + `index` hints** — Drizzle generates optimal SQL when using its query builder. Avoid raw `sql` template literals unless necessary.

2. **Batch inserts for survey questions/options:**
   ```typescript
   await db.insert(surveyQuestions).values(questionRows).returning();
   // Single INSERT ... RETURNING instead of N individual inserts
   ```

3. **Cursor-based pagination for large feeds** (survey lists, notifications):
   ```typescript
   // Instead of OFFSET (slow for deep pages):
   db.select().from(surveys)
     .where(lt(surveys.createdAt, cursor))
     .orderBy(desc(surveys.createdAt))
     .limit(20);
   ```

4. **Denormalization already applied wisely** — `response_answers.surveyId` is denormalized (ADR-009 noted in code) for per-survey aggregation. This is correct.

5. **JSONB indexing for `audience_criteria` filtering:**
   ```sql
   CREATE INDEX surveys_audience_criteria_idx ON surveys USING GIN (audience_criteria);
   ```
   Only needed once audience filtering becomes a hot query path.

### 2.4 Migration Strategy

**Current:** Using `drizzle-kit push:pg` (schema push) for dev. 

**Recommendation for production:**
- Switch to `drizzle-kit generate:pg` + `drizzle-kit migrate` for versioned migrations.
- Never use `push:pg` against production.
- Add migrations to CI pipeline.

---

## 3. API Error Handling Best Practices

### 3.1 Current State (Already Strong)

The project has a well-structured error handling system:

- **`GlobalExceptionFilter`** (`@Catch()` — catches everything)
- **Unified response format:** `{ success: false, error: { code, message, details? } }`
- **Error code mapping:** HTTP status → machine-readable string (`BAD_REQUEST`, `UNAUTHORIZED`, etc.)
- **ZodValidationPipe:** Custom pipe using Zod for request validation
- **ThrottlerGuard:** Global rate limiting with Redis storage
- **Structured logging:** 5xx errors get stack traces, 429/401/403 get warnings

### 3.2 Recommendations

#### A. Add Domain-Specific Error Classes

```typescript
// common/errors/business-errors.ts
export class SurveyNotFoundError extends HttpException {
  constructor(surveyId: string) {
    super({ message: `問卷不存在: ${surveyId}` }, HttpStatus.NOT_FOUND);
  }
}

export class InsufficientBalanceError extends HttpException {
  constructor() {
    super({ message: '錢包餘額不足' }, HttpStatus.PAYMENT_REQUIRED);
  }
}

export class DuplicateResponseError extends HttpException {
  constructor() {
    super({ message: '您已填答過此問卷' }, HttpStatus.CONFLICT);
  }
}
```

This replaces raw `throw new HttpException(message, status)` scattered across services.

#### B. Add Request ID Tracing

```typescript
// middleware/request-id.middleware.ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req['requestId'] = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', req['requestId']);
    next();
  }
}
```

Include `requestId` in error responses for production debugging:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "伺服器發生錯誤，請稍後再試",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### C. Error Response Schema Enhancement

Add `ERROR_CODES` for domain-specific errors (beyond HTTP status codes):

```typescript
// Current: just HTTP status mapping
// Proposed: add business error codes
export const BUSINESS_ERROR_CODES = {
  SURVEY_NOT_FOUND: 'SURVEY_NOT_FOUND',
  SURVEY_NOT_PUBLISHED: 'SURVEY_NOT_PUBLISHED',
  DUPLICATE_RESPONSE: 'DUPLICATE_RESPONSE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  WALLET_LOCK_CONFLICT: 'WALLET_LOCK_CONFLICT',
  ANTI_CHEAT_REJECTED: 'ANTI_CHEAT_REJECTED',
  KYC_REQUIRED: 'KYC_REQUIRED',
} as const;
```

#### D. Structured Error Logging with Sentry

The project already has `SENTRY_DSN` in env config. Ensure:
- All 5xx errors are captured by Sentry
- 4xx errors are NOT sent to Sentry (noise)
- Add user context (`userId`, `role`) to Sentry scope

---

## 4. Rate Limiting Libraries

### 4.1 Current State

Using `@nestjs/throttler` v6.5 with custom `RedisThrottlerStorage`:
- **Short:** 10 req/s (TTL 1s)
- **Medium:** 100 req/min (TTL 60s)
- Global `ThrottlerGuard` applied via `APP_GUARD`

This is solid. The Redis-backed storage ensures consistency across multiple API instances.

### 4.2 Recommendations

1. **Per-endpoint overrides** for sensitive routes:
   ```typescript
   @Throttle({ short: { ttl: 1000, limit: 3 } })  // login: 3 req/s
   @Post('login')
   async login() { ... }
   
   @Throttle({ short: { ttl: 1000, limit: 1 } })  // wallet: 1 req/s
   @Post('wallet/withdraw')
   async withdraw() { ... }
   ```

2. **Sliding window algorithm** (upgrade from fixed window):
   - Current Redis storage likely uses fixed window. For production, implement sliding window to prevent burst at window boundaries.
   - Alternative: Use `rate-limiter-flexible` package for more sophisticated algorithms.

3. **Distributed rate limiting** is already handled via Redis — no changes needed for horizontal scaling.

4. **Rate limit headers** in response:
   ```typescript
   res.setHeader('X-RateLimit-Limit', limit);
   res.setHeader('X-RateLimit-Remaining', remaining);
   res.setHeader('X-RateLimit-Reset', resetTime);
   ```

---

## 5. Additional Performance Recommendations

### 5.1 Redis Caching Strategy

The project has `RedisModule` and `RedisLockService`. Extend usage:

| Use Case | Cache Key Pattern | TTL |
|----------|------------------|-----|
| Survey detail (published) | `survey:{id}` | 60s |
| User profile | `profile:{userId}` | 300s |
| Available survey list | `surveys:available:{category}` | 30s |
| Rate limit counters | Already in place | — |

### 5.2 Database-Level Optimizations

1. **`VACUUM` and `ANALYZE` scheduling:** PostgreSQL auto-vacuum is sufficient for most cases, but after bulk data loads (seed scripts), run `VACUUM ANALYZE` manually.

2. **Partitioning for `survey_responses`** when data grows:
   ```sql
   -- Future: partition by survey_id or created_at range
   CREATE TABLE survey_responses_2026_q3 PARTITION OF survey_responses
     FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
   ```
   Only needed when table exceeds ~10M rows.

3. **`pg_stat_statements`** extension for query performance monitoring:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
   ```

### 5.3 Drizzle ORM Tips

- **Use `columns` select** to avoid fetching unnecessary fields:
  ```typescript
  db.select({ id: users.id, email: users.email }).from(users);
  ```
- **Use prepared statements** for repeated queries:
  ```typescript
  const findByEmail = db.select().from(users).where(eq(users.email, placeholder('email'))).prepare();
  const user = await findByEmail.execute({ email: 'test@example.com' });
  ```

---

## 6. Summary Checklist for Engineering Team

- [ ] Add composite indexes for task list ordering and notification pagination
- [ ] Configure explicit connection pool settings (max: 20, idle timeout: 30s)
- [ ] Evaluate PgBouncer for production connection pooling
- [ ] Switch from `push:pg` to migration-based schema changes
- [ ] Create domain-specific error classes
- [ ] Add request ID middleware for error tracing
- [ ] Implement per-endpoint rate limit overrides for sensitive routes
- [ ] Add rate limit response headers
- [ ] Set up Redis caching for frequently-read survey/profile data
- [ ] Enable `pg_stat_statements` for query monitoring
- [ ] Ensure Sentry captures only 5xx errors with user context

---

*This brief was compiled by analyzing the codebase at `/home/aa/projects/quanwen/` and `/home/aa/quanwen/`.*
