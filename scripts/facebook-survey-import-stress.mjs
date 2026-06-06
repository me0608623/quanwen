#!/usr/bin/env node

/**
 * Import and stress-test survey templates derived from a Facebook group.
 *
 * This script intentionally does not bypass Facebook login, group membership,
 * rate limits, or anti-scraping controls. It can:
 * - fetch public group metadata that Facebook exposes to logged-out users;
 * - extract survey URLs from HTML/text files provided by an authorized user;
 * - import supported public form URLs via existing QuanWen import endpoints;
 * - fall back to QuanWenSurvey v1 JSON drafts for unsupported/private sources;
 * - run concurrent POST /surveys/import requests for basic load testing.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_GROUP_URL = 'https://www.facebook.com/groups/269013233204234';
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const DEFAULT_EMAIL = 'user1@quanwen.com';
const DEFAULT_PASSWORD = '000';

const SUPPORTED_URL_HOSTS = [
  'docs.google.com',
  'forms.gle',
  'surveycake.com',
  'www.surveycake.com',
];

function usage() {
  console.log(`
Usage:
  node scripts/facebook-survey-import-stress.mjs [options]

Options:
  --api <url>             API base URL. Default: ${DEFAULT_API_URL}
  --email <email>         Login email. Default: ${DEFAULT_EMAIL}
  --password <password>   Login password. Default: ${DEFAULT_PASSWORD}
  --group <url>           Facebook group URL. Default: ${DEFAULT_GROUP_URL}
  --html <path>           Authorized saved Facebook/group HTML to parse.
  --links <path>          Text file containing survey URLs, one per line.
  --count <n>             Total import attempts. Default: 25
  --concurrency <n>       Concurrent requests. Default: 5
  --delay-ms <n>          Delay after each worker request. Default: 0
  --retry-429 <n>         Retries for HTTP 429 responses. Default: 0
  --dry-run               Generate payloads and report sources without API calls.
  --out <dir>             Save generated payloads/results. Default: artifacts/facebook-import-stress
  --help                  Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    api: process.env.QUANWEN_API_URL ?? DEFAULT_API_URL,
    email: process.env.QUANWEN_EMAIL ?? DEFAULT_EMAIL,
    password: process.env.QUANWEN_PASSWORD ?? DEFAULT_PASSWORD,
    group: DEFAULT_GROUP_URL,
    html: undefined,
    links: undefined,
    count: 25,
    concurrency: 5,
    delayMs: 0,
    retry429: 0,
    dryRun: false,
    out: 'artifacts/facebook-import-stress',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const key = arg.replace(/^--/, '');
    const isKnownDashedKey = key === 'delay-ms' || key === 'retry-429';
    if (!arg.startsWith('--') || (!(key in args) && !isKnownDashedKey)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    i += 1;
    if (key === 'delay-ms') {
      args.delayMs = Number.parseInt(value, 10);
      if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
        throw new Error(`${arg} must be a non-negative integer`);
      }
    } else if (key === 'retry-429') {
      args.retry429 = Number.parseInt(value, 10);
      if (!Number.isFinite(args.retry429) || args.retry429 < 0) {
        throw new Error(`${arg} must be a non-negative integer`);
      }
    } else if (key === 'count' || key === 'concurrency') {
      args[key] = Number.parseInt(value, 10);
      if (!Number.isFinite(args[key]) || args[key] < 1) {
        throw new Error(`${arg} must be a positive integer`);
      }
    } else {
      args[key] = value;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(input) {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractMeta(html) {
  const decoded = decodeHtml(html);
  const title =
    decoded.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1] ??
    decoded.match(/<title>([^<]+)/i)?.[1] ??
    'Facebook survey group';
  const description =
    decoded.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i)?.[1] ??
    decoded.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] ??
    '';
  return { title: title.trim(), description: description.trim() };
}

function normalizeCandidateUrl(raw) {
  let value = decodeHtml(raw).trim();
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'l.facebook.com' && parsed.searchParams.get('u')) {
      value = parsed.searchParams.get('u');
    }
  } catch {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function extractSurveyUrls(text) {
  const decoded = decodeHtml(text);
  const matches = decoded.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [];
  const urls = new Set();

  for (const raw of matches) {
    const normalized = normalizeCandidateUrl(raw);
    if (!normalized) continue;
    const { hostname, pathname } = new URL(normalized);
    const host = hostname.replace(/^www\./, '');
    const looksLikeSurvey =
      SUPPORTED_URL_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`)) ||
      /survey|form|questionnaire|問卷/i.test(normalized) ||
      host.includes('qualtrics') ||
      host.includes('typeform') ||
      host.includes('jotform');
    if (looksLikeSurvey && !pathname.includes('/groups/')) {
      urls.add(normalized);
    }
  }

  return [...urls];
}

async function fetchPublicFacebookMetadata(groupUrl) {
  const res = await fetch(groupUrl, {
    headers: {
      'user-agent': 'QuanWen QA metadata fetcher; contact=local-dev',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  const html = await res.text();
  const meta = extractMeta(html);
  const urls = extractSurveyUrls(html);
  return {
    status: res.status,
    bytes: Buffer.byteLength(html),
    meta,
    urls,
  };
}

function questionBank(seed) {
  const suffix = seed + 1;
  return [
    {
      type: 'single_choice',
      title: `您目前填寫論文或市場問卷的頻率為何？ #${suffix}`,
      description: '用於模擬 Facebook 問卷互助社常見篩選題。',
      sortOrder: 0,
      isRequired: true,
      options: [
        { label: '每週多次', sortOrder: 0 },
        { label: '每週一次', sortOrder: 1 },
        { label: '每月數次', sortOrder: 2 },
        { label: '很少填寫', sortOrder: 3 },
      ],
    },
    {
      type: 'multiple_choice',
      title: '您通常願意協助填答哪些類型的研究問卷？',
      sortOrder: 1,
      isRequired: true,
      options: [
        { label: '消費者行為', sortOrder: 0 },
        { label: '教育學習', sortOrder: 1 },
        { label: '職場管理', sortOrder: 2 },
        { label: '科技產品', sortOrder: 3 },
        { label: '健康生活', sortOrder: 4 },
      ],
    },
    {
      type: 'rating',
      title: '您認為互助社問卷連結的品質整體如何？',
      sortOrder: 2,
      isRequired: true,
      config: { maxRating: 5, scaleStart: 1, leftLabel: '很差', rightLabel: '很好' },
    },
    {
      type: 'single_choice',
      title: '注意力檢核：請選擇「同意」。',
      sortOrder: 3,
      isRequired: true,
      options: [
        { label: '非常不同意', sortOrder: 0 },
        { label: '不同意', sortOrder: 1 },
        { label: '同意', sortOrder: 2 },
        { label: '非常同意', sortOrder: 3 },
      ],
      config: { attentionCheck: true, expectedAnswer: '同意' },
    },
    {
      type: 'text',
      title: '您希望問卷互助平台改善哪些填答或媒合體驗？',
      sortOrder: 4,
      isRequired: false,
      config: { minLength: 5, maxLength: 500 },
    },
  ];
}

function buildQuanWenSurvey({ index, sourceUrl, groupMeta }) {
  const importedFrom = sourceUrl ? `來源連結：${sourceUrl}` : '來源：Facebook 公開社團 metadata / 壓測代表資料';
  return {
    $schema: 'quanwen.survey.v1',
    exportedAt: new Date().toISOString(),
    platform: { name: 'quanwen-facebook-import-stress', version: '1.0.0' },
    survey: {
      title: `Facebook 問卷互助匯入測試 ${String(index + 1).padStart(3, '0')}`,
      description: [
        groupMeta?.title ? `社團：${groupMeta.title}` : undefined,
        groupMeta?.description ? `描述：${groupMeta.description}` : undefined,
        importedFrom,
      ].filter(Boolean).join('\n'),
      type: 'standard',
      category: 'academic',
      isAnonymous: true,
      rewardPoints: 0,
      targetCount: 100,
      aiReviewEnabled: true,
      externalUrl: sourceUrl ?? null,
      audienceCriteria: {
        minReputationScore: 0,
        education: ['college', 'graduate'],
      },
      questions: questionBank(index),
    },
  };
}

async function login(api, email, password) {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await safeJson(res);
  if (!res.ok) {
    throw new Error(`Login failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  if (!body?.token) {
    throw new Error('Login response did not include token');
  }
  return body.token;
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function postJson(api, token, path, payload) {
  const started = performance.now();
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await safeJson(res);
  return {
    ok: res.ok,
    status: res.status,
    retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
    ms: Math.round(performance.now() - started),
    body,
  };
}

function parseRetryAfter(value) {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

async function with429Retry(fn, retries) {
  let attempt = 0;
  let totalWaitMs = 0;
  let result = await fn();
  while (result.status === 429 && attempt < retries) {
    attempt += 1;
    const waitMs = result.retryAfterMs ?? Math.min(60_000, 1000 * 2 ** (attempt - 1));
    totalWaitMs += waitMs;
    await sleep(waitMs);
    result = await fn();
  }
  return { ...result, retryCount: attempt, retryWaitMs: totalWaitMs };
}

async function importOne(api, token, payload, index, options = {}) {
  const retry429 = options.retry429 ?? 0;
  const sourceUrl = payload.survey.externalUrl;
  if (sourceUrl) {
    const url = new URL(sourceUrl);
    if (url.hostname === 'docs.google.com' || url.hostname === 'forms.gle') {
      const result = await with429Retry(
        () => postJson(api, token, '/surveys/import/google-forms', { url: sourceUrl }),
        retry429,
      );
      if (result.ok) return { index, mode: 'google-forms', sourceUrl, ...result };
    }
    if (url.hostname.endsWith('surveycake.com')) {
      const result = await with429Retry(
        () => postJson(api, token, '/surveys/import/surveycake', { url: sourceUrl }),
        retry429,
      );
      if (result.ok) return { index, mode: 'surveycake', sourceUrl, ...result };
    }
  }

  return {
    index,
    mode: 'quanwen-json',
    sourceUrl,
    ...(await with429Retry(() => postJson(api, token, '/surveys/import', payload), retry429)),
  };
}

async function runPool(items, concurrency, worker, options = {}) {
  const results = new Array(items.length);
  const delayMs = options.delayMs ?? 0;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
      if (delayMs > 0 && cursor < items.length) {
        await sleep(delayMs);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function summarize(results) {
  const latencies = results.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b);
  const count = results.length;
  const ok = results.filter((r) => r.ok).length;
  const failed = count - ok;
  const percentile = (p) => {
    if (latencies.length === 0) return null;
    const idx = Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1);
    return latencies[idx];
  };
  const byStatus = {};
  const byMode = {};
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
  }
  return {
    count,
    ok,
    failed,
    byStatus,
    byMode,
    latencyMs: {
      min: latencies[0] ?? null,
      p50: percentile(50),
      p95: percentile(95),
      max: latencies.at(-1) ?? null,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });

  const fb = await fetchPublicFacebookMetadata(args.group);
  const fileTexts = [];
  if (args.html) fileTexts.push(await readFile(args.html, 'utf8'));
  if (args.links) fileTexts.push(await readFile(args.links, 'utf8'));

  const urls = new Set([...fb.urls]);
  for (const text of fileTexts) {
    for (const url of extractSurveyUrls(text)) urls.add(url);
  }

  const sources = [...urls];
  const payloads = Array.from({ length: args.count }, (_, index) => {
    const sourceUrl = sources.length > 0 ? sources[index % sources.length] : undefined;
    return buildQuanWenSurvey({ index, sourceUrl, groupMeta: fb.meta });
  });

  const payloadPath = join(args.out, `payloads-${Date.now()}.json`);
  await writeFile(payloadPath, JSON.stringify({ facebook: fb, sources, payloads }, null, 2));

  console.log(JSON.stringify({
    facebook: {
      status: fb.status,
      bytes: fb.bytes,
      title: fb.meta.title,
      publicSurveyUrlsFound: fb.urls.length,
    },
    providedSurveyUrlsFound: sources.length,
    payloads: payloads.length,
    payloadPath,
    dryRun: args.dryRun,
  }, null, 2));

  if (args.dryRun) return;

  const token = await login(args.api, args.email, args.password);
  const started = performance.now();
  const results = await runPool(payloads, args.concurrency, (payload, index) =>
    importOne(args.api, token, payload, index, { retry429: args.retry429 }),
    { delayMs: args.delayMs },
  );
  const elapsedMs = Math.round(performance.now() - started);
  const report = {
    api: args.api,
    count: args.count,
    concurrency: args.concurrency,
    delayMs: args.delayMs,
    retry429: args.retry429,
    elapsedMs,
    requestsPerSecond: Number((args.count / (elapsedMs / 1000)).toFixed(2)),
    summary: summarize(results),
    failures: results
      .filter((r) => !r.ok)
      .slice(0, 10)
      .map((r) => ({ index: r.index, mode: r.mode, sourceUrl: r.sourceUrl, status: r.status, body: r.body })),
    successfulIds: results
      .filter((r) => r.ok)
      .map((r) => r.body?.data?.id)
      .filter(Boolean),
  };
  const reportPath = join(args.out, `report-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify({ report, results }, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exitCode = 1;
});
