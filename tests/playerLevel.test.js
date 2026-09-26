import { describe, it, expect } from 'vitest';
import { levelFromXp, levelProgress, xpForLevel } from '../src/systems/PlayerLevel.js';

// Same fixture as supabase/tests/levels_test.sql — game and database must agree.
const FIXTURE = [
  [0, 1],
  [1, 1],
  [999, 1],
  [1000, 2],
  [2499, 2],
  [2500, 3],
  [4499, 3],
  [4500, 4],
  [7000, 5],
  [26999, 9],
  [27000, 10],
  [104499, 19],
  [104500, 20],
  [5000000, 140],
];

describe('player level', () => {
  it('matches the shared game/database fixture', () => {
    for (const [xp, level] of FIXTURE) expect(levelFromXp(xp)).toBe(level);
  });

  it('each level costs 500 XP more than the previous one', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(1000);
    for (let l = 2; l < 50; l++) {
      const cost = xpForLevel(l + 1) - xpForLevel(l);
      expect(cost).toBe(1000 + 500 * (l - 1));
    }
  });

  it('reaches every level exactly at its threshold', () => {
    for (let l = 1; l <= 400; l++) {
      expect(levelFromXp(xpForLevel(l))).toBe(l);
      expect(levelFromXp(xpForLevel(l + 1) - 1)).toBe(l);
    }
  });

  it('treats missing / negative XP as level 1', () => {
    expect(levelFromXp(undefined)).toBe(1);
    expect(levelFromXp(-50)).toBe(1);
    expect(levelFromXp('abc')).toBe(1);
  });

  it('reports progress inside the current level', () => {
    expect(levelProgress(1750)).toEqual({
      level: 2,
      xp: 1750,
      levelXp: 1000,
      nextXp: 2500,
      into: 750,
      needed: 1500,
      progress: 0.5,
    });
    expect(levelProgress(0).progress).toBe(0);
  });
});
