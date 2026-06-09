import { describe, expect, it, beforeEach } from 'vitest';
import { AiPromptDedupeService } from './ai-prompt-dedupe.service.js';

describe('AiPromptDedupeService', () => {
  let service: AiPromptDedupeService;

  beforeEach(() => {
    service = new AiPromptDedupeService();
  });

  describe('makeKey', () => {
    it('produces the same key for the same userId and payload', () => {
      const k1 = service.makeKey('user-1', { topic: 'AI', count: 5 });
      const k2 = service.makeKey('user-1', { topic: 'AI', count: 5 });
      expect(k1).toBe(k2);
    });

    it('is key-order-independent for objects', () => {
      const k1 = service.makeKey('user-1', { count: 5, topic: 'AI' });
      const k2 = service.makeKey('user-1', { topic: 'AI', count: 5 });
      expect(k1).toBe(k2);
    });

    it('differs for different userId with same payload', () => {
      const k1 = service.makeKey('user-1', { topic: 'AI' });
      const k2 = service.makeKey('user-2', { topic: 'AI' });
      expect(k1).not.toBe(k2);
    });

    it('differs for same userId with different payload', () => {
      const k1 = service.makeKey('user-1', { topic: 'AI' });
      const k2 = service.makeKey('user-1', { topic: 'ML' });
      expect(k1).not.toBe(k2);
    });
  });

  describe('get / set', () => {
    it('returns undefined for missing key', () => {
      expect(service.get('nonexistent')).toBeUndefined();
    });

    it('returns stored result', () => {
      service.set('key1', { questions: ['Q1', 'Q2'] });
      expect(service.get('key1')).toEqual({ questions: ['Q1', 'Q2'] });
    });

    it('increments size on set and resets on clear', () => {
      expect(service.size).toBe(0);
      service.set('k1', 'r1');
      service.set('k2', 'r2');
      expect(service.size).toBe(2);
      service.clear();
      expect(service.size).toBe(0);
    });

    it('deduplicates: second get for same key returns cached result', () => {
      const key = service.makeKey('u1', { topic: 'Test' });
      service.set(key, { draft: 'result' });

      const first = service.get(key);
      const second = service.get(key);
      expect(first).toEqual({ draft: 'result' });
      expect(second).toEqual({ draft: 'result' });
    });

    it('overwriting a key replaces the stored value', () => {
      service.set('key1', 'old');
      service.set('key1', 'new');
      expect(service.get('key1')).toBe('new');
    });
  });
});
