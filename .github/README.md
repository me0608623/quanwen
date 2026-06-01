# GitHub CI/CD Configuration

## CI Workflow

The `.github/workflows/ci.yml` file defines the continuous integration pipeline that runs on every push and pull request to `main` and `develop` branches.

### Jobs

| Job | Purpose | Status |
|-----|---------|--------|
| `ai-prompt-change-guard` | Warns about LLM prompt/schema changes | ✅ Active |
| `static` | Type-check, lint, security audit | ✅ Active |
| `test` | Unit + integration tests | ✅ Active |
| `build` | Build API and web | ✅ Active |
| `e2e` | Playwright end-to-end tests | ✅ Active |
| `docker-web` | Docker image build + smoke test | ✅ Active |

### Security Audit

The security audit (`pnpm audit --audit-level high`) currently runs in **soft-fail mode** (`continue-on-error: true`). This is intentional due to 5 remaining high-severity advisories in transitive dependencies. This should be changed to hard-fail before production launch.

See QUA-219 for details.

## Preview Deploy (Deferred)

**Status**: Not implemented
**Reason**: Cost avoidance per QUA-6 acceptance criteria

Preview deployments on PRs (via Vercel, Netlify, or similar) would incur ongoing hosting costs. As noted in QUA-6:

> Preview deploy on PR (Vercel or equivalent free tier). OK to defer if it costs anything; document why.

Since no free tier option was identified that meets the project's requirements without eventual cost, this feature remains deferred.

### Alternatives Considered

1. **Vercel Free Tier**: Limited to 100GB bandwidth/month, would eventually require paid tier
2. **Netlify Free Tier**: Limited to 100GB bandwidth/month, would eventually require paid tier
3. **Self-hosted preview**: Requires additional infrastructure and maintenance

### Future Implementation

If preview deployments become a priority, the following would be needed:
- Hosting provider selection
- Preview environment configuration (separate DB instance)
- Environment variable management for preview deployments

## Branch Protection

To enforce quality checks before merge, configure GitHub branch protection rules:

1. Go to repository Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - **Require status checks to pass before merging**
   - Require checks: `Type-check / Lint / Audit`, `Unit + Integration tests`, `Build`
   - **Require branches to be up to date before merging**

This configuration is a manual repository setting and cannot be automated via code.
