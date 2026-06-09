import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

const DEDUPE_TTL_MS = 60_000; // 60 seconds
const DEDUPE_MAX_ENTRIES = 1000;

interface DedupeEntry<T> {
  result: T;
  expiresAt: number;
}

/**
 * Per-user prompt deduplication cache (in-memory LRU, 60-second TTL).
 *
 * Prevents the same user from triggering redundant LLM calls with identical
 * request payloads within a short window.  The second and subsequent requests
 * within TTL receive the cached result without hitting Z.ai.
 *
 * Key = SHA-256( userId + ":" + canonicalisedPayload ).
 * Multi-instance deployments: each process maintains its own LRU; L2 Redis
 * sharing is not needed here because cost protection still holds per-process.
 */
@Injectable()
export class AiPromptDedupeService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly cache = new Map<string, DedupeEntry<any>>();

  makeKey(userId: string, payload: unknown): string {
    // JSON.stringify with sorted replacer keeps key order stable for plain objects.
    // For arrays or primitives, falls back to standard serialization.
    const replacer =
      payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        ? (Object.keys(payload as Record<string, unknown>) as string[]).sort()
        : undefined;
    const canonical = JSON.stringify(payload, replacer);
    return createHash('sha256')
      .update(`${userId}:${canonical}`)
      .digest('hex');
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // LRU: move to tail
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result as T;
  }

  set<T>(key: string, result: T): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, { result, expiresAt: Date.now() + DEDUPE_TTL_MS });
    // Evict oldest when over capacity
    if (this.cache.size > DEDUPE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  /** For testing */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
