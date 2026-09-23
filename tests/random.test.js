import { describe, it, expect } from 'vitest';
import { Random } from '../src/utils/random.js';

describe('Random', () => {
  it('is deterministic for a given seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('produces values in [0, 1)', () => {
    const r = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() is inclusive of both bounds', () => {
    const r = new Random(1);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted() never picks zero-weight keys', () => {
    const r = new Random(3);
    for (let i = 0; i < 500; i++) expect(r.weighted({ a: 1, b: 0 })).toBe('a');
  });
});
