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

describe('hidden platforms', () => {
  const still = { axis: 0, consumeShoot: () => false };

  const fallOnto = async (platformY, inset) => {
    const { World } = await import('../src/core/World.js');
    const { EventBus } = await import('../src/core/EventBus.js');
    const world = new World(new EventBus());
    if (inset !== undefined) world.setBottomInset(inset);
    world.springs = [];
    world.monsters = [];
    world.coins = [];
    world.powerUps = [];
    const p = new Platform(
      world.player.x - 30,
      world.camera.bottom + platformY,
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
    expect((await fallOnto(+40)).bounced).toBe(false);
  });

  it('a platform hidden behind the on-screen controls does not catch you either', async () => {
    const { CAMERA } = await import('../src/config/constants.js');
    // 60 units above the bottom edge = behind the ~120-unit control bar
    expect((await fallOnto(-60)).bounced).toBe(false);
    expect((await fallOnto(-(CAMERA.BOTTOM_INSET + 2))).bounced).toBe(false); // top too close
  });

  it('a platform above the controls works normally', async () => {
    const { CAMERA } = await import('../src/config/constants.js');
    const { bounced } = await fallOnto(-(CAMERA.BOTTOM_INSET + CAMERA.LANDING_MARGIN + 30));
    expect(bounced).toBe(true);
  });

  it('follows the inset the UI measures, within limits', async () => {
    const { CAMERA } = await import('../src/config/constants.js');
    // no controls: everything down to the screen edge counts
    expect((await fallOnto(-60, 0)).bounced).toBe(true);
    const { world } = await fallOnto(-300, 150);
    expect(world.landingFloor).toBe(world.camera.bottom - 150 - CAMERA.LANDING_MARGIN);
    world.setBottomInset(9999);
    expect(world.bottomInset).toBe(CAMERA.MAX_BOTTOM_INSET);
    world.setBottomInset(NaN);
    expect(world.bottomInset).toBe(CAMERA.MAX_BOTTOM_INSET);
  });

  it('a new run starts on a platform above the controls', async () => {
    const { World } = await import('../src/core/World.js');
    const { EventBus } = await import('../src/core/EventBus.js');
    for (const inset of [0, 120, 180]) {
      const world = new World(new EventBus());
      world.setBottomInset(inset);
      world.reset();
      expect(world.player.y).toBeLessThan(world.landingFloor);
      // and the player can actually bounce off it
      let bounced = false;
      for (let i = 0; i < 60 && !bounced; i++) {
        world.update(dt, still);
        bounced = world.player.vy < 0;
      }
      expect(bounced).toBe(true);
      expect(world.over).toBe(false);
    }
  });
});
