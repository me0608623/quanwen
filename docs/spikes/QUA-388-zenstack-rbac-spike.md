# QUA-388 Spike: ZenStack RBAC on Survey Model — Coexistence Validation

**Date:** 2026-06-07
**Author:** Founding Engineer (CTO Agent)
**Status:** SPIKE COMPLETE — ❌ Not Viable (Prisma Dependency Mismatch)

---

## Executive Summary

ZenStack is **not viable** for our codebase. It requires Prisma as its ORM layer (ZModel compiles to Prisma schema + enhanced client), but we use **Drizzle ORM** throughout. Adopting ZenStack would mean either migrating our entire data layer from Drizzle to Prisma or running dual ORMs — both unacceptable for a production system with 20+ schema files and complex query patterns.

**Recommendation:** Proceed with **Plan B — CASL + Drizzle** (application-level ABAC), or implement a lightweight custom guard middleware.

---

## 1. What We Evaluated

### ZenStack Architecture
- **ZModel** — declarative schema + policy rules (replaces/augments `schema.prisma`)
- **Enhanced Prisma Client** — auto-generated CRUD with built-in access filtering
- **Runtime** — intercepts queries, injects `WHERE` clauses based on auth context

### Expected Integration Path
1. Install zenstack in `apps/api`
2. Create `.zmodel` for Survey with policy rules for `surveyor` / `respondent` / `admin`
3. Verify enhanced client works alongside existing queries
4. Validate policy enforcement via tests

---

## 2. Blocking Issue: ORM Incompatibility

### Our Stack (Current)
| Layer | Tech | File |
|-------|------|------|
| ORM | **Drizzle ORM** `^0.45.2` | `apps/api/package.json` |
| Schema | `drizzle-orm/pg-core` | `apps/api/src/db/schema/*.ts` (20+ files) |
| Queries | `drizzle-orm` operators (`eq`, `and`, `desc`, etc.) | All services |
| Migrations | `drizzle-kit` | `pnpm db:push`, `db:generate` |

### ZenStack Requirements
| Layer | Tech |
|-------|------|
| ORM | **Prisma** (required — ZModel compiles to Prisma schema) |
| Schema | `.zmodel` files → generates `schema.prisma` |
| Queries | Prisma Client (enhanced) |
| Migrations | Prisma Migrate |

### Why This Blocks Us

1. **ZModel → Prisma schema**: ZenStack's `.zmodel` files compile to `schema.prisma`. There is no Drizzle adapter. The entire `enhanced client` is a Prisma client wrapper.

2. **Dual ORM overhead**: Running both Drizzle AND Prisma against the same PostgreSQL database means:
   - Two schema definition systems to keep in sync (20+ Drizzle tables → duplicate as Prisma models)
   - Two migration systems (Drizzle Kit + Prisma Migrate) competing for schema changes
   - Two connection pools consuming resources
   - Double the build complexity

3. **No gradual adoption path**: ZenStack's policy enforcement only works on queries through its enhanced Prisma client. Our existing Drizzle queries (`surveys.service.ts`, `responses.service.ts`, etc.) would bypass all policy rules.

---

## 3. Current RBAC Implementation (What We Already Have)

Our existing authorization is manual but functional:

### Role-Based Guards
```
AdminGuard → checks user.role === 'admin' (apps/api/src/admin/admin.guard.ts)
JwtAuthGuard → authenticates JWT, injects user into request
```

### Owner-Check Pattern (Surveys)
```typescript
// surveys.service.ts — assertOwnerAndDraft()
if (survey.surveyorId !== surveyorId) {
  throw new ForbiddenException('無權操作此問卷');
}
```

### Role-Based Access (Responses)
- `surveyor`: CRUD own surveys, view own responses
- `respondent`: Read published surveys, submit responses
- `admin`: Full access via AdminGuard

### Gaps (What We'd Want RBAC to Solve)
1. **No centralized policy layer** — each service method does its own checks
2. **Respondent survey filtering** is SQL-level in `ResponsesService.getAvailableSurveys()` rather than declarative
3. **Admin override** requires manual `AdminGuard` on each controller

---

## 4. Policy Rules We Would Have Written (ZModel)

For reference, here's what the ZModel policy would look like — this translates directly to our Plan B guard implementation:

```zmodel
// HYPOTHETICAL — requires Prisma, which we don't use

model Survey {
  id          String   @id @default(uuid())
  surveyorId  String
  status      SurveyStatus
  // ... other fields

  // surveyor: CRUD own surveys
  @@allow('create', auth.role == 'surveyor')
  @@allow('read', auth.id == this.surveyorId)
  @@allow('update', auth.id == this.surveyorId && this.status in ['draft', 'rejected'])
  @@allow('delete', auth.id == this.surveyorId && this.status in ['draft', 'rejected'])

  // respondent: Read published surveys only
  @@allow('read', auth.role == 'respondent' && this.status == 'published')

  // admin: Full access
  @@allow('all', auth.role == 'admin')
}
```

---

## 5. Fallback: Plan B Recommendations

### Option A: CASL + Drizzle (Application-Level ABAC)
- Define abilities using `@casl/ability` (as evaluated in QUA-307)
- Create a `SurveyAbility` factory that generates CASL rules from user role + context
- Apply via NestJS guards or Drizzle middleware
- **Pros:** Works with Drizzle, flexible, well-tested library
- **Cons:** Policy not at data layer; must manually apply to each query

### Option B: Lightweight Custom Guard Middleware
- Create `RbacGuard` that reads a policy config (similar to ZModel rules but in TypeScript)
- Apply declaratively via decorators: `@RequirePermission('survey:update-own')`
- Minimal dependencies, full Drizzle compatibility
- **Pros:** Zero new dependencies, fits existing patterns
- **Cons:** Must maintain policy rules manually

### Option C: Row-Level Security (PostgreSQL RLS)
- Push access control down to PostgreSQL RLS policies
- Set session variables (`SET app.current_user_id`, `SET app.current_role`) per request
- **Pros:** Impossible to bypass, works with any ORM
- **Cons:** Complex to debug, migration-heavy, testing harder

**My recommendation: Option B first (quick win), with Option A (CASL) when complexity outgrows custom guards.**

---

## 6. Specific ZenStack Limitations Noted

Even if we were on Prisma, these would be concerns:

| Limitation | Impact |
|------------|--------|
| Schema rigidity — all models must be in `.zmodel` files | Would require migrating 20+ Drizzle schema files |
| No support for complex SQL (CTEs, window functions, raw queries) | Our `getCategoryCounts()` and `getAvailableSurveys()` use subqueries that may not map cleanly |
| Policy rules are row-level only | Cannot express "surveyor can only publish if questions > 0" (business rules) |
| Generated client adds ~200KB to bundle | Minor but adds cold-start latency |
| Community size (~2.9K stars) | Risk of abandoned maintenance |

---

## 7. Success Criteria Assessment

| Criterion | Result |
|-----------|--------|
| ZenStack policy rules prevent unauthorized access | ❌ Cannot test — requires Prisma migration |
| Existing queries continue to work unchanged | ❌ Drizzle queries would bypass ZenStack entirely |
| No performance regression | N/A — cannot run benchmarks |

---

## 8. References

- ZenStack docs: https://zenstack.dev/docs
- Our CASL evaluation: QUA-307
- Prior ZenStack proposal: QUA-291 (was deferred — this spike confirms the deferral was correct)
- ADOPT decision: QUA-385
- Our schema files: `apps/api/src/db/schema/` (Drizzle ORM)
