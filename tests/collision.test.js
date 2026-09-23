import { describe, it, expect } from 'vitest';
import { aabbOverlap, circleRectOverlap, landsOn } from '../src/systems/Collision.js';

describe('aabbOverlap', () => {
  it('detects overlap and separation', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(aabbOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(aabbOverlap(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('circleRectOverlap', () => {
  const rect = { x: 0, y: 0, w: 10, h: 10 };
  it('hits when the circle touches an edge', () => {
    expect(circleRectOverlap(15, 5, 5, rect)).toBe(true);
  });
  it('misses a corner outside the radius', () => {
    expect(circleRectOverlap(14, 14, 5, rect)).toBe(false);
  });
});

describe('landsOn (one-way platforms)', () => {
  const surface = { x: 100, y: 200, w: 80 };
  const feet = { left: 120, right: 160 };

  it('lands when crossing the top while falling', () => {
    expect(landsOn(feet, 195, 205, 300, surface)).toBe(true);
  });
  it('passes through when moving upward', () => {
    expect(landsOn(feet, 205, 195, -300, surface)).toBe(false);
  });
  it('ignores platforms that were already below the feet', () => {
    expect(landsOn(feet, 210, 220, 300, surface)).toBe(false);
  });
  it('requires horizontal overlap', () => {
    expect(landsOn({ left: 0, right: 40 }, 195, 205, 300, surface)).toBe(false);
  });
});
