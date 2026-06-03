import { describe, it, expect } from 'vitest';
import { shuffleOptions } from './shuffle';

describe('shuffleOptions', () => {
  const items = [1, 2, 3, 4, 5];

  it('returns a copy unchanged for mode "none"', () => {
    const out = shuffleOptions(items, 'none', 'seed');
    expect(out).toEqual(items);
    expect(out).not.toBe(items); // new array
  });

  it('never mutates the input array', () => {
    const original = [...items];
    shuffleOptions(items, 'all', 'seed-x');
    expect(items).toEqual(original);
  });

  it('is deterministic for the same seed', () => {
    const a = shuffleOptions(items, 'all', 'abc');
    const b = shuffleOptions(items, 'all', 'abc');
    expect(a).toEqual(b);
  });

  it('produces different orders for different seeds (usually)', () => {
    const a = shuffleOptions(items, 'all', 'seed-1');
    const b = shuffleOptions(items, 'all', 'seed-2');
    // extremely unlikely to be equal for 5 elements with distinct seeds
    expect(a).not.toEqual(b);
  });

  it('preserves all elements (is a permutation)', () => {
    const out = shuffleOptions(items, 'all', 'perm');
    expect([...out].sort((x, y) => x - y)).toEqual(items);
  });

  it('keeps the last element fixed for mode "exceptLast"', () => {
    const out = shuffleOptions(items, 'exceptLast', 'last');
    expect(out[out.length - 1]).toBe(5);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
  });

  it('returns a copy for length <= 1', () => {
    expect(shuffleOptions([42], 'all', 's')).toEqual([42]);
    expect(shuffleOptions([], 'all', 's')).toEqual([]);
  });
});
