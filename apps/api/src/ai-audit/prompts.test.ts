import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HOLISTIC_JUDGE,
  WITHDRAWAL_RISK,
  PLATFORM_HEALTH,
  ALL_PROMPTS,
  metaOf,
} from './prompts';
import { GROUNDING_SUFFIX } from './schemas';

describe('AI prompt registry', () => {
  it('所有註冊 prompt 都有 key / version / system body', () => {
    for (const p of ALL_PROMPTS) {
      expect(p.key).toMatch(/^[a-z_]+\.[a-z_]+$/); // 領域.用途
      expect(p.version).toMatch(/^\d+\.\d+\.\d+$/); // semver-ish
      expect(p.system.length).toBeGreaterThan(20);
    }
  });

  it('所有 prompt system body 含 GROUNDING_SUFFIX 接地原則', () => {
    for (const p of ALL_PROMPTS) {
      expect(p.system).toContain(GROUNDING_SUFFIX);
      expect(p.system).toContain('manual_review');
      expect(p.system).toContain('禁止猜測');
    }
  });

  it('key 之間不重複', () => {
    const keys = ALL_PROMPTS.map((p) => p.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('HOLISTIC_JUDGE 包含問卷品質判斷的核心字眼', () => {
    expect(HOLISTIC_JUDGE.system).toContain('問卷品質');
    expect(HOLISTIC_JUDGE.system).toContain('0-100');
  });

  it('WITHDRAWAL_RISK 包含金融反詐字眼', () => {
    expect(WITHDRAWAL_RISK.system).toContain('反詐');
    expect(WITHDRAWAL_RISK.system).toContain('redFlags');
  });

  it('PLATFORM_HEALTH 包含 status enum', () => {
    expect(PLATFORM_HEALTH.system).toContain('healthy');
    expect(PLATFORM_HEALTH.system).toContain('attention');
    expect(PLATFORM_HEALTH.system).toContain('critical');
  });

  it('metaOf 回傳 key + version', () => {
    const meta = metaOf(HOLISTIC_JUDGE);
    expect(meta).toEqual({
      key: 'quality_audit.holistic_judge',
      version: '1.0.0',
    });
  });
});

describe('resolvePrompt (Phase II.6 feature flag)', () => {
  const ENV_KEY = 'AI_PROMPT_QUALITY_AUDIT__HOLISTIC_JUDGE_VERSION';

  // 確保 test 開始 / 結束都清乾淨
  beforeEach(() => {
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('無 env override → 回 default entry', async () => {
    const { resolvePrompt, HOLISTIC_JUDGE } = await import('./prompts');
    const p = resolvePrompt(HOLISTIC_JUDGE);
    expect(p.version).toBe('1.0.0');
  });

  it('env 指定 default version → 仍回 default', async () => {
    const { resolvePrompt, HOLISTIC_JUDGE } = await import('./prompts');
    process.env[ENV_KEY] = '1.0.0';
    const p = resolvePrompt(HOLISTIC_JUDGE);
    expect(p.version).toBe('1.0.0');
  });

  it('env 指定存在的 alt version → 用 alt', async () => {
    const { resolvePrompt, HOLISTIC_JUDGE } = await import('./prompts');
    const alt = {
      key: HOLISTIC_JUDGE.key,
      version: '2.0.0',
      system: 'alt prompt v2',
    };
    process.env[ENV_KEY] = '2.0.0';
    const p = resolvePrompt(HOLISTIC_JUDGE, [alt]);
    expect(p.version).toBe('2.0.0');
    expect(p.system).toBe('alt prompt v2');
  });

  it('env 指定不存在的 version → fallback 回 default', async () => {
    const { resolvePrompt, HOLISTIC_JUDGE } = await import('./prompts');
    process.env[ENV_KEY] = '99.99.99';
    const p = resolvePrompt(HOLISTIC_JUDGE);
    expect(p.version).toBe('1.0.0');
  });

  it('envKeyFor 把 key dotted notation 轉成 env-safe', async () => {
    const { envKeyFor } = await import('./prompts');
    expect(envKeyFor('quality_audit.holistic_judge')).toBe(
      'AI_PROMPT_QUALITY_AUDIT__HOLISTIC_JUDGE_VERSION',
    );
    expect(envKeyFor('admin.platform_health')).toBe(
      'AI_PROMPT_ADMIN__PLATFORM_HEALTH_VERSION',
    );
  });
});
