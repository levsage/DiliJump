import { describe, it, expect, vi } from 'vitest';
import { MAGNET, PHYSICS, PLAYER, PLATFORM_TYPES } from '../src/config/constants.js';
import { EventBus, EVENTS } from '../src/core/EventBus.js';
import { World } from '../src/core/World.js';
import { Coin } from '../src/entities/Coin.js';
import { PowerUp } from '../src/entities/PowerUp.js';
import { Platform } from '../src/entities/Platform.js';
import { LevelGenerator } from '../src/systems/LevelGenerator.js';

const dt = PHYSICS.FIXED_STEP;
const still = { axis: 0, consumeShoot: () => false };

/** A world with nothing in it but the player, hovering in place. */
function emptyWorld() {
  const events = new EventBus();
  const world = new World(events);
  world.coins = [];
  world.powerUps = [];
  world.monsters = [];
  world.springs = [];
  const p = world.player;
  // hold the mascot in mid-air: no gravity surprises in these tests
  p.update = () => {};
  return { world, events, p };
}

const step = (world, seconds) => {
  for (let t = 0; t < seconds; t += dt) world.update(dt, still);
};

describe('magnet power-up', () => {
  it('picking it up starts the magnet and tells the game', () => {
    const { world, events, p } = emptyWorld();
    const onMagnet = vi.fn();
    events.on(EVENTS.MAGNET, onMagnet);
    world.powerUps.push(new PowerUp(p.x, p.y - PLAYER.HITBOX_HEIGHT / 2));
    step(world, dt);
    expect(onMagnet).toHaveBeenCalledWith(MAGNET.DURATION);
    expect(world.magnetTime).toBeGreaterThan(MAGNET.DURATION - 0.1);
    expect(world.powerUps[0].collected).toBe(true);
  });

  it('pulls coins in range to the player and collects them', () => {
    const { world, p } = emptyWorld();
    world.magnetTime = MAGNET.DURATION;
    const near = new Coin(p.x + 150, p.y - 150);
    const far = new Coin(p.x + MAGNET.RADIUS + 120, p.y - 40);
    world.coins.push(near, far);
    step(world, 1);
    expect(near.collected).toBe(true);
    expect(far.collected).toBe(false);
    expect(far.magnetized).toBe(false);
    expect(world.coinsCollected).toBe(1);
  });

  it('does nothing when inactive, and runs out after its duration', () => {
    const { world, events, p } = emptyWorld();
    const coin = new Coin(p.x + 150, p.y - 150);
    world.coins.push(coin);
    step(world, 1);
    expect(coin.magnetized).toBe(false);

    const shown = [];
    events.on(EVENTS.HUD_MAGNET, (s) => shown.push(s));
    world.magnetTime = MAGNET.DURATION;
    step(world, MAGNET.DURATION + 0.2);
    expect(world.magnetTime).toBe(0);
    // HUD countdown: whole seconds only, ending with 0
    expect(shown.at(-1)).toBe(0);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('a coin already flying keeps coming after the magnet ends', () => {
    const { world, p } = emptyWorld();
    const coin = new Coin(p.x + 200, p.y - 120);
    world.coins.push(coin);
    world.magnetTime = dt * 2;
    step(world, dt * 3);
    expect(coin.magnetized).toBe(true);
    expect(world.magnetTime).toBe(0);
    step(world, 1.5);
    expect(coin.collected).toBe(true);
  });

  it('a coin on a moving platform leaves it when pulled', () => {
    const plat = new Platform(100, 300, PLATFORM_TYPES.MOVING, { vx: 80 });
    const coin = new Coin(140, 266, { attachedTo: plat });
    coin.pullTowards(300, 100, dt);
    expect(coin.attachedTo).toBeNull();
  });
});

describe('magnet spawning', () => {
  const makeWorld = () => ({
    platforms: [],
    coins: [],
    powerUps: [],
    springs: [],
    monsters: [],
    originY: 740,
    magnetTime: 0,
  });

  it('never appears on the first screens, and is rare but present later', () => {
    const world = makeWorld();
    const gen = new LevelGenerator(world, { seed: 5 });
    gen.init(740);
    gen.generateUntil(740 - MAGNET.MIN_SCORE * 6, 0);
    expect(world.powerUps).toHaveLength(0);

    let spawned = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const w = makeWorld();
      const g = new LevelGenerator(w, { seed });
      g.init(740);
      // collect each magnet as soon as it spawns, so the next can appear
      for (let y = 740; y > -60000; y -= 400) {
        g.generateUntil(y, 0);
        for (const u of w.powerUps) {
          expect(g.scoreAt(u.y)).toBeGreaterThanOrEqual(MAGNET.MIN_SCORE - 10);
          if (!u.collected) {
            u.collect();
            spawned++;
          }
        }
      }
    }
    expect(spawned).toBeGreaterThan(8);
    expect(spawned).toBeLessThan(400);
  });

  it('at most one waits in the level, and none while a magnet is active', () => {
    const world = makeWorld();
    const gen = new LevelGenerator(world, { seed: 11 });
    gen.init(740);
    gen.generateUntil(-80000, 0);
    expect(world.powerUps.filter((u) => !u.collected)).toHaveLength(1);

    const active = makeWorld();
    active.magnetTime = 5;
    const g2 = new LevelGenerator(active, { seed: 11 });
    g2.init(740);
    g2.generateUntil(-80000, 0);
    expect(active.powerUps).toHaveLength(0);
  });
});
