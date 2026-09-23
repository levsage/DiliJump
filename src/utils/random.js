/**
 * Seedable PRNG (mulberry32). Deterministic generation makes the level
 * generator unit-testable and allows future "daily seed" modes.
 */
export class Random {
  constructor(seed = Date.now()) {
    this.seed(seed);
  }

  seed(seed) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, maxInclusive) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick a key from a { key: weight } map. */
  weighted(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [key, w] of entries) {
      if ((r -= w) < 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}
