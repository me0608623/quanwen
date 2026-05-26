import { GROUNDING_SUFFIX } from './schemas';

/**
 * Phase II.5: AI prompt 版本化 registry。
 *
 * 為什麼集中：
 * 1. **可追溯**：每次改 prompt 一定要 bump version；telemetry log 會帶 prompt key + version，
 *    後續可看「哪個版本造成 LLM 拒絕率改變」
 * 2. **A/B 測試準備**：未來想對同一 service 跑兩個 prompt variant，只要在這加一個 entry
 * 3. **單元測試友善**：prompt 文字本身可被斷言，不再藏在 service 內
 * 4. **diff 友善**：reviewer 看 prompts.ts 的改動就知道 prompt 變了
 *
 * GROUNDING_SUFFIX 來自 schemas.ts（與 Zod schemas 同源），這裡 import 後 append。
 */

export interface PromptEntry {
  key: string;        // 業務領域 + 用途，方便 log filter
  version: string;    // semver-ish；prompt 字串改動必須 bump
  system: string;     // system prompt
  // judgment：評分/分析類，須含 GROUNDING_SUFFIX（anti-hallucination）
  // generation：生成類（如生問卷），需要創造力，不套 grounding 但嚴格約束輸出結構
  kind: 'judgment' | 'generation';
}

/** 給 telemetry log 用 — 不重複 ground rules，只報 entry metadata */
export interface PromptMeta {
  key: string;
  version: string;
}

function withGrounding(systemBody: string): string {
  return systemBody + GROUNDING_SUFFIX;
}

// ─── quality-audit: Layer 3 holistic judge ──────────────────────────────────

export const HOLISTIC_JUDGE: PromptEntry = {
  key: 'quality_audit.holistic_judge',
  version: '1.0.0',
  kind: 'judgment',
  system: withGrounding(
    '你是台灣資深問卷品質審核員（市調公司 10 年經驗）。判斷填答整體誠意，給 0-100 分。' +
      '回繁體中文 JSON，語氣中立、具體、可被申訴。',
  ),
};

// ─── admin: withdrawal risk assessment ─────────────────────────────────────

export const WITHDRAWAL_RISK: PromptEntry = {
  key: 'admin.withdrawal_risk',
  version: '1.0.0',
  kind: 'judgment',
  system: withGrounding(
    '你是金融反詐分析師。給出客觀的提領風險評估。' +
      '只回傳合法 JSON，繁體中文，redFlags 每項 ≤ 35 字，禁編造。',
  ),
};

// ─── admin: platform health summary ────────────────────────────────────────

export const PLATFORM_HEALTH: PromptEntry = {
  key: 'admin.platform_health',
  version: '1.0.0',
  kind: 'judgment',
  system: withGrounding(
    '你是 SaaS 平台健康度分析師。基於平台統計給出簡潔健康摘要與行動建議。' +
      '回繁體中文 JSON。status 為 healthy/attention/critical 三選一。' +
      '所有條目限制 ≤ 40 字，不可編造資料。',
  ),
};

// ─── surveys: AI 一鍵生成問卷草稿 ───────────────────────────────────────────

/**
 * 生成類 prompt 與評分類不同 —— **不** append GROUNDING_SUFFIX。
 * 評分要 anti-hallucination（不准超出 input 推論）；生成則需要創造力，
 * 但仍要嚴格約束**輸出結構**，否則 normalize 救不回來。
 */
export const SURVEY_DRAFT: PromptEntry = {
  key: 'surveys.ai_draft',
  // v1 inline；v2 收進 registry + 強化結構約束；v2.1 支援使用者「偏好題型」
  version: '2.1.0',
  kind: 'generation',
  system: [
    '你是專業問卷設計顧問。根據使用者提供的「主題 + 目的 + 受眾」，產生一份結構完整的問卷草稿。',
    '',
    '只回傳合法 JSON，結構如下（不要 markdown code fence、不要解說）：',
    '{',
    '  "title": "問卷標題（≤40 字，點出主題）",',
    '  "description": "1-2 句問卷說明，告訴填答者目的與預估時間",',
    '  "questions": [',
    '    {',
    '      "type": "single_choice | multiple_choice | text | rating",',
    '      "title": "題目文字",',
    '      "isRequired": true,',
    '      "options": [{ "label": "選項文字" }],   // 僅 choice 題需要',
    '      "config": { "maxRating": 5 }            // 僅 rating 題需要',
    '    }',
    '  ]',
    '}',
    '',
    '硬規則（違反會被系統丟棄該題）：',
    '- single_choice / multiple_choice：必須 3-6 個互斥、無重複的選項',
    '- text：不要給 options',
    '- rating：不要給 options，config.maxRating 用 5',
    '- 不要用 matrix（太複雜）',
    '- 題目用繁體中文，中立不帶引導性、不雙重否定',
    '',
    '設計準則：',
    '- 開頭放簡單的背景/篩選題，敏感題放後面',
    '- 題型混搭（別整份都單選），至少 1 題開放式收集質性回饋',
    '- 題數依使用者要求；沒指定就 8-10 題',
    '- 涵蓋目的所需的關鍵面向，但別冗長',
    '- 若使用者指定「偏好題型」，請以那些題型為主（佔多數），其餘題型酌量點綴；' +
      '若未指定則自由混搭',
  ].join('\n'),
};

// ─── helpers ─────────────────────────────────────────────────────────────────

export function metaOf(entry: PromptEntry): PromptMeta {
  return { key: entry.key, version: entry.version };
}

/** 給測試/管理用 — 列出所有註冊 prompts */
export const ALL_PROMPTS: PromptEntry[] = [
  HOLISTIC_JUDGE,
  WITHDRAWAL_RISK,
  PLATFORM_HEALTH,
  SURVEY_DRAFT,
];

// ─── Phase II.6: env feature flag for prompt version ────────────────────────

/**
 * 同一 key 可註冊多個 version（A/B 用）。
 * env `AI_PROMPT_<DOMAIN.USE>_VERSION` 指定要用哪個 version；不指定走 default。
 *
 * 例：對 quality_audit.holistic_judge 啟用 v2 →
 *   AI_PROMPT_QUALITY_AUDIT__HOLISTIC_JUDGE_VERSION=2.0.0
 *
 * 為什麼 env 而非 db flag：
 * - dev/staging/prod 環境隔離；同一 commit 部署到不同環境可跑不同 prompt
 * - 重啟即生效，不需 db migration
 * - 對 prompt A/B 這種低頻變更，env 比 db flag 簡單
 */
function envKeyFor(promptKey: string): string {
  return `AI_PROMPT_${promptKey.toUpperCase().replace(/\./g, '__')}_VERSION`;
}

/**
 * 取 prompt：依 env 偏好版本，否則 default。
 *
 * @param defaultEntry 該 key 的預設 entry（通常是 v1.0.0）
 * @param alternatives 其他註冊版本（同 key 不同 version）
 */
export function resolvePrompt(
  defaultEntry: PromptEntry,
  alternatives: PromptEntry[] = [],
): PromptEntry {
  const envKey = envKeyFor(defaultEntry.key);
  const wanted = process.env[envKey];
  if (!wanted || wanted === defaultEntry.version) return defaultEntry;

  const match = alternatives.find(
    (p) => p.key === defaultEntry.key && p.version === wanted,
  );
  return match ?? defaultEntry; // 找不到 alt 退回 default（保守 fallback）
}

/** 把 envKeyFor export 出來供測試用 */
export { envKeyFor };
