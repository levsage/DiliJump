import { describe, it, expect } from 'vitest';
import { PHYSICS, PLATFORM_TYPES, PLAYER, PLAYFIELD, WALL, VIEW } from '../src/config/constants.js';
import { Player } from '../src/entities/Player.js';
import { Platform } from '../src/entities/Platform.js';
import { Monster } from '../src/entities/Monster.js';

const dt = PHYSICS.FIXED_STEP;
const reach = PLAYER.HITBOX_WIDTH / 2 - WALL.PLAYER_OVERLAP;

describe('side walls', () => {
  it('leave a playfield between two walls', () => {
    expect(PLAYFIELD.LEFT).toBe(WALL.WIDTH);
    expect(PLAYFIELD.RIGHT).toBe(VIEW.WIDTH - WALL.WIDTH);
  });

  for (const [name, axis] of [
    ['left', -1],
    ['right', 1],
  ]) {
    it(`the mascot can never pass the ${name} wall (no wrap-around)`, () => {
      const p = new Player(VIEW.WIDTH / 2, 400);
      let bumps = 0;
      for (let i = 0; i < 5 / dt; i++) {
        p.update(dt, axis);
        if (p.wallBump) bumps++;
        expect(p.x).toBeGreaterThanOrEqual(PLAYFIELD.LEFT + reach);
        expect(p.x).toBeLessThanOrEqual(PLAYFIELD.RIGHT - reach);
      }
      expect(p.x).toBeCloseTo(axis < 0 ? PLAYFIELD.LEFT + reach : PLAYFIELD.RIGHT - reach);
      // one bump on impact, not every frame while pressing against the wall
      expect(bumps).toBe(1);
      expect(p.wallBump).toBe(0);
    });
  }

  it('reports which wall was hit and stops the sideways speed', () => {
    const p = new Player(PLAYFIELD.LEFT + reach + 1, 400);
    p.vx = -PHYSICS.MAX_MOVE_SPEED;
    p.update(dt, -1);
    expect(p.wallBump).toBe(-1);
    expect(p.vx).toBe(0);
    // can move away from the wall right after
    for (let i = 0; i < 20; i++) p.update(dt, 1);
    expect(p.x).toBeGreaterThan(PLAYFIELD.LEFT + reach);
  });

  it('a gentle touch is not a bump', () => {
    const p = new Player(PLAYFIELD.RIGHT - reach - 0.5, 400);
    p.vx = WALL.BUMP_SPEED / 2;
    p.update(dt, 0);
    expect(p.wallBump).toBe(0);
  });

  it('moving platforms bounce off the walls', () => {
    const pl = new Platform(PLAYFIELD.LEFT + 2, 300, PLATFORM_TYPES.MOVING, { vx: -200 });
    for (let i = 0; i < 10 / dt; i++) {
      pl.update(dt);
      expect(pl.x).toBeGreaterThanOrEqual(PLAYFIELD.LEFT);
      expect(pl.x + pl.w).toBeLessThanOrEqual(PLAYFIELD.RIGHT);
    }
  });

  it('monsters patrol between the walls', () => {
    const m = new Monster(PLAYFIELD.RIGHT - 40, 300, { vx: 110 });
    for (let i = 0; i < 20 / dt; i++) {
      m.update(dt);
      expect(m.x - m.w / 2).toBeGreaterThanOrEqual(PLAYFIELD.LEFT - 1);
      expect(m.x + m.w / 2).toBeLessThanOrEqual(PLAYFIELD.RIGHT + 1);
    }
  });
});
