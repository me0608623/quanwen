/**
 * Seeded pseudo-random shuffle utility for survey randomization.
 *
 * Uses a simple mulberry32 PRNG so that the same seed always produces the
 * same order, which is critical for:
 *  - Reproducible analytics (knowing which variant each respondent saw)
 *  - Server-side validation of shuffled answer submissions
 *
 * QUA-204: Question and answer option randomization to prevent position bias.
 */

// ─── Mulberry32 PRNG ──────────────────────────────────────────────────────────

/** Create a 32-bit PRNG from a numeric seed. Returns [0, 1) floats. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit integer (djb2). */
export function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ─── Fisher-Yates shuffle with PRNG ───────────────────────────────────────────

/** Shuffle an array in-place using the given PRNG, returning the same reference. */
export function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Shuffle mode types ────────────────────────────────────────────────────────

export type ShuffleOption = 'none' | 'all' | 'exceptLast';

/**
 * Shuffle options according to the given mode and seed.
 * - 'none': return original array copy
 * - 'all': fully shuffle all options
 * - 'exceptLast': shuffle all but the last option (keep "Other" etc. in place)
 *
 * Always returns a **new** array; never mutates the input.
 */
export function shuffleOptions<T>(items: T[], mode: ShuffleOption, seed: string): T[] {
  if (mode === 'none' || items.length <= 1) return [...items];

  const rng = mulberry32(hashSeed(seed));

  if (mode === 'exceptLast' && items.length > 1) {
    const head = items.slice(0, -1);
    const last = items[items.length - 1];
    return [...shuffleArray(head, rng), last];
  }

  return shuffleArray([...items], rng);
}

/**
 * Shuffle question order for display.
 */
export function shuffleQuestions<T>(items: T[], mode: ShuffleOption, seed: string): T[] {
  return shuffleOptions(items, mode, seed);
}

/**
 * Generate a short random seed (8 hex chars) for a new response.
 */
export function generateSeed(): string {
  const bytes = new Uint8Array(4);
  try {
    const { randomBytes } = require('crypto');
    const buf = randomBytes(4);
    return buf.toString('hex');
  } catch {
    return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  }
}
