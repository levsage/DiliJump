import { describe, it, expect } from 'vitest';
import { LevelGenerator } from '../src/systems/LevelGenerator.js';
import { getDifficulty } from '../src/systems/Difficulty.js';
import { PHYSICS, PLATFORM, PLATFORM_TYPES, VIEW } from '../src/config/constants.js';

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

  it('keeps platforms within the screen', () => {
    const world = makeWorld();
    const gen = new LevelGenerator(world, { seed: 5 });
    gen.init(740);
    gen.generateUntil(-20000, 0);
    for (const p of world.platforms) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(VIEW.WIDTH);
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
