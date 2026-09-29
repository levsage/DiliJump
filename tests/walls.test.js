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

describe('platforms at the bottom of the screen', () => {
  const still = { axis: 0, consumeShoot: () => false };

  /** Drop the player onto a platform whose top is `fromBottom` units above the screen's bottom edge. */
  const fallOnto = async (fromBottom) => {
    const { World } = await import('../src/core/World.js');
    const { EventBus } = await import('../src/core/EventBus.js');
    const world = new World(new EventBus());
    world.springs = [];
    world.monsters = [];
    world.coins = [];
    world.powerUps = [];
    const p = new Platform(
      world.player.x - 30,
      world.camera.bottom - fromBottom,
      PLATFORM_TYPES.NORMAL,
    );
    world.platforms = [p];
    world.player.y = p.y - 30;
    world.player.vy = 400;
    let bounced = false;
    for (let i = 0; i < 20 && !bounced; i++) {
      world.update(dt, still);
      bounced = world.player.vy < 0;
    }
    return { world, bounced };
  };

  it('a platform below the bottom of the screen never catches a falling player', async () => {
    expect((await fallOnto(-40)).bounced).toBe(false);
    expect((await fallOnto(0)).bounced).toBe(false); // exactly on the edge: not visible
  });

  it('a platform that has almost scrolled off (only a sliver showing) does not count', async () => {
    const { CAMERA } = await import('../src/config/constants.js');
    expect((await fallOnto(CAMERA.LANDING_MARGIN - 2)).bounced).toBe(false);
  });

  it('a visible platform near the bottom still catches you, even behind the controls', async () => {
    const { CAMERA } = await import('../src/config/constants.js');
    // e.g. the cut-off platform under the shoot button in the bug report
    expect((await fallOnto(CAMERA.LANDING_MARGIN + 4)).bounced).toBe(true);
    expect((await fallOnto(60)).bounced).toBe(true); // behind the control bar
    expect((await fallOnto(200)).bounced).toBe(true);
  });

  it('the landing floor is the bottom edge of the screen minus the margin', async () => {
    const { CAMERA } = await import('../src/config/constants.js');
    const { world } = await fallOnto(100);
    expect(world.landingFloor).toBe(world.camera.bottom - CAMERA.LANDING_MARGIN);
  });

  it('a new run starts on a platform clear of the controls', async () => {
    const { World } = await import('../src/core/World.js');
    const { EventBus } = await import('../src/core/EventBus.js');
    const { CAMERA } = await import('../src/config/constants.js');
    const world = new World(new EventBus());
    expect(world.player.y).toBe(VIEW.HEIGHT - CAMERA.START_HEIGHT);
    let bounced = false;
    for (let i = 0; i < 60 && !bounced; i++) {
      world.update(dt, still);
      bounced = world.player.vy < 0;
    }
    expect(bounced).toBe(true);
    expect(world.over).toBe(false);
  });
});
