/**
 * Client-side shuffle utility matching the backend shuffle.ts logic.
 * QUA-204: Question and answer option randomization to prevent position bias.
 */

export type ShuffleOption = 'none' | 'all' | 'exceptLast';

// ─── Mulberry32 PRNG (matches backend) ─────────────────────────────────────────

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

function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Shuffle items according to the given mode and seed.
 * Returns a new array; never mutates the input.
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
