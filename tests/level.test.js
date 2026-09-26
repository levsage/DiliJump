import { describe, it, expect } from 'vitest';
import { LevelGenerator } from '../src/systems/LevelGenerator.js';
import { getDifficulty } from '../src/systems/Difficulty.js';
import { PHYSICS, PLATFORM, PLATFORM_TYPES, PLAYFIELD } from '../src/config/constants.js';

const makeWorld = () => ({ platforms: [], coins: [], springs: [], monsters: [], originY: 740 });

describe('Difficulty', () => {
  it('never allows gaps above the jump apex', () => {
    const apex = PHYSICS.JUMP_VELOCITY ** 2 / (2 * PHYSICS.GRAVITY);
    for (const score of [0, 1000, 5000, 20000, 1e6]) {
      expect(getDifficulty(score).gapMax).toBeLessThan(apex);
    }
  });

  it('gets harder with score', () => {
    const easy = getDifficulty(0);
    const hard = getDifficulty(15000);
    expect(hard.gapMax).toBeGreaterThan(easy.gapMax);
    expect(hard.monsterChance).toBeGreaterThan(easy.monsterChance);
  });
});

describe('LevelGenerator', () => {
  it('always generates a reachable path', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const world = makeWorld();
      const gen = new LevelGenerator(world, { seed });
      gen.init(740);
      gen.generateUntil(-60000, 0);

      const reachable = world.platforms
        .filter((p) => p.type !== PLATFORM_TYPES.BREAKING)
        .map((p) => p.y)
        .sort((a, b) => b - a);

      for (let i = 1; i < reachable.length; i++) {
        expect(reachable[i - 1] - reachable[i]).toBeLessThanOrEqual(PLATFORM.MAX_GAP + 0.001);
      }
    }
  });

  it('keeps platforms, coins and monsters between the side walls', () => {
    for (const seed of [5, 6, 7]) {
      const world = makeWorld();
      const gen = new LevelGenerator(world, { seed });
      gen.init(740);
      gen.generateUntil(-40000, 0);
      for (const p of world.platforms) {
        expect(p.x).toBeGreaterThanOrEqual(PLAYFIELD.LEFT);
        expect(p.x + p.w).toBeLessThanOrEqual(PLAYFIELD.RIGHT);
      }
      for (const c of world.coins) {
        expect(c.x).toBeGreaterThan(PLAYFIELD.LEFT);
        expect(c.x).toBeLessThan(PLAYFIELD.RIGHT);
      }
      for (const m of world.monsters) {
        expect(m.x - m.w / 2).toBeGreaterThanOrEqual(PLAYFIELD.LEFT);
        expect(m.x + m.w / 2).toBeLessThanOrEqual(PLAYFIELD.RIGHT);
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = makeWorld();
    const b = makeWorld();
    new LevelGenerator(a, { seed: 77 }).init(740);
    new LevelGenerator(b, { seed: 77 }).init(740);
    expect(a.platforms.map((p) => [p.x, p.y, p.type])).toEqual(
      b.platforms.map((p) => [p.x, p.y, p.type]),
    );
  });
});
