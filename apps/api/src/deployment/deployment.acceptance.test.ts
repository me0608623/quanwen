import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('QUA-274 — deployment assets are wired for free hosting', () => {
  it('Render blueprint keeps the API on Docker with the critical env vars', () => {
    const renderYaml = readRepoFile('render.yaml');

    expect(renderYaml).toContain('name: quanwen-api');
    expect(renderYaml).toContain('runtime: docker');
    expect(renderYaml).toContain('dockerfilePath: ./apps/api/Dockerfile');
    expect(renderYaml).toContain('healthCheckPath: /health');

    for (const key of [
      'DATABASE_URL',
      'WEB_URL',
      'CORS_ORIGINS',
      'JWT_SECRET',
      'PII_ENCRYPTION_KEY',
      'PII_KDF_SALT',
      'ECPAY_MERCHANT_ID',
      'ECPAY_HASH_KEY',
      'ECPAY_HASH_IV',
    ]) {
      expect(renderYaml).toContain(`key: ${key}`);
    }
  });

  it('Vercel config builds the Next.js frontend from apps/web', () => {
    const vercelJson = JSON.parse(readRepoFile('apps/web/vercel.json')) as Record<string, string>;

    expect(vercelJson.framework).toBe('nextjs');
    expect(vercelJson.installCommand).toBe('pnpm install --frozen-lockfile');
    expect(vercelJson.buildCommand).toBe('pnpm build');
    expect(vercelJson.devCommand).toBe('pnpm dev');
  });

  it('Production env example keeps secrets on the backend and public vars on the frontend', () => {
    const envExample = readRepoFile('.env.production.example');

    expect(envExample).toContain('NEXT_PUBLIC_API_URL=https://your-render-api.onrender.com/api/v1');
    expect(envExample).toContain('WEB_URL=https://your-vercel-app.vercel.app');
    expect(envExample).toContain('CORS_ORIGINS=https://your-vercel-app.vercel.app,https://your-custom-domain.com');
    expect(envExample).toContain('JWT_SECRET=replace-with-at-least-64-random-characters');
    expect(envExample).toContain('PII_ENCRYPTION_KEY=replace-with-at-least-64-random-characters');
    expect(envExample).toContain('GOOGLE_CALLBACK_URL=https://your-render-api.onrender.com/api/v1/auth/google/callback');

    const publicSecretLeaks = envExample
      .split('\n')
      .filter((line) => line.startsWith('NEXT_PUBLIC_'))
      .filter((line) => /(SECRET|KEY|PASSWORD|TOKEN)/.test(line));

    expect(publicSecretLeaks).toEqual([]);
  });

  it('API bootstrap only allows configured CORS origins instead of opening the whole internet like a clown', () => {
    const mainTs = readRepoFile('apps/api/src/main.ts');

    expect(mainTs).toContain('parseAllowedOrigins(process.env.WEB_URL)');
    expect(mainTs).toContain('process.env.CORS_ORIGINS ? parseAllowedOrigins(process.env.CORS_ORIGINS) : []');
    expect(mainTs).toContain('allowedOrigins.includes(origin)');
    expect(mainTs).toContain('credentials: true');
  });

  it('Render Dockerfile ignores junk files and still boots the Nest API', () => {
    const dockerfile = readRepoFile('apps/api/Dockerfile');
    const dockerignore = readRepoFile('apps/api/.dockerignore');

    expect(dockerfile).toContain('FROM node:22-alpine AS base');
    expect(dockerfile).toContain('RUN pnpm --filter api build');
    expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');

    for (const ignored of ['node_modules', 'dist', '.env', 'coverage']) {
      expect(dockerignore).toContain(ignored);
    }
  });
});
