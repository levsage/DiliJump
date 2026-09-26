import {
  VIEW,
  PLAYFIELD,
  PLATFORM,
  PLATFORM_TYPES,
  COIN,
  MONSTER,
  SCORING,
} from '../config/constants.js';
import { Platform } from '../entities/Platform.js';
import { Coin } from '../entities/Coin.js';
import { Spring } from '../entities/Spring.js';
import { Monster } from '../entities/Monster.js';
import { getDifficulty } from './Difficulty.js';
import { Random } from '../utils/random.js';

/**
 * Procedurally generates the vertical level ahead of the camera.
 *
 * Guarantee: the vertical distance between consecutive *reachable*
 * platforms (anything except breaking decoys) never exceeds
 * PLATFORM.MAX_GAP, which is below the player's jump apex — so every run
 * is always completable. Everything is placed between the side walls
 * (PLAYFIELD.LEFT … PLAYFIELD.RIGHT).
 */
export class LevelGenerator {
  constructor(world, { seed, left = PLAYFIELD.LEFT, right = PLAYFIELD.RIGHT } = {}) {
    this.world = world;
    this.left = left;
    this.right = right;
    this.width = right - left;
    this.rng = new Random(seed);
    this.lastReachableY = 0;
    this.lastX = left + this.width / 2;
  }

  /** Relative position (0 = left wall, 1 = right wall) → world x. */
  at(t) {
    return this.left + this.width * t;
  }

  /** Lay down the starting floor + first screen of platforms. */
  init(startY) {
    const floor = new Platform(this.at(0.5) - PLATFORM.WIDTH / 2, startY, PLATFORM_TYPES.NORMAL);
    this.world.platforms.push(floor);
    this.lastReachableY = startY;
    this.lastX = floor.x;
    this.generateUntil(startY - VIEW.HEIGHT * 1.5, 0);
    return floor;
  }

  /** Scoreboard height (in points) at a given world Y. */
  scoreAt(y) {
    return Math.max(0, (this.world.originY - y) / SCORING.PIXELS_PER_POINT);
  }

  generateUntil(targetY, score) {
    while (this.lastReachableY > targetY) {
      this.step(score);
    }
  }

  step(score) {
    const d = getDifficulty(Math.max(score, this.scoreAt(this.lastReachableY)));
    const gap = this.rng.range(d.gapMin, d.gapMax);
    const y = this.lastReachableY - gap;

    // Horizontal placement: bounded distance from the previous platform keeps
    // every jump reachable (there is no screen wrap — the sides are walls).
    const maxShift = this.width * 0.55;
    let x = this.lastX + this.rng.range(-maxShift, maxShift);
    x = Math.max(this.left, Math.min(this.right - PLATFORM.WIDTH, x));

    const type = this.rng.weighted(d.typeWeights);
    const platform = new Platform(x, y, type, {
      vx: type === PLATFORM_TYPES.MOVING ? d.movingSpeed * (this.rng.chance(0.5) ? 1 : -1) : 0,
    });
    this.world.platforms.push(platform);
    this.lastReachableY = y;
    this.lastX = x;

    this.decorate(platform, d);

    // Breaking decoy between reachable platforms.
    if (gap > 90 && this.rng.chance(d.breakingChance)) {
      const bx = this.rng.range(this.left, this.right - PLATFORM.WIDTH);
      const by = y + gap * this.rng.range(0.35, 0.65);
      if (Math.abs(bx - x) > PLATFORM.WIDTH) {
        this.world.platforms.push(new Platform(bx, by, PLATFORM_TYPES.BREAKING));
      }
    }

    // Floating coin trails in open air.
    if (this.rng.chance(COIN.TRAIL_CHANCE)) this.coinTrail(y);

    // Monsters, never too close to the platform the player needs.
    if (this.rng.chance(d.monsterChance)) {
      const mx = x + PLATFORM.WIDTH / 2 < this.at(0.5) ? this.at(0.75) : this.at(0.25);
      const moving = this.rng.chance(0.4 + d.level * 0.4);
      this.world.monsters.push(
        new Monster(mx, y - gap * 0.5 - MONSTER.HEIGHT / 2, {
          vx: moving ? this.rng.range(40, 110) : 0,
        }),
      );
    }
  }

  decorate(platform, d) {
    if (platform.type === PLATFORM_TYPES.VANISHING) return;
    const cx = platform.w / 2;
    if (this.rng.chance(d.springChance)) {
      const offset = this.rng.range(8, platform.w - 36);
      this.world.springs.push(new Spring(platform, offset));
    } else if (this.rng.chance(d.coinChance)) {
      this.world.coins.push(
        new Coin(platform.x + cx, platform.y - 34, {
          attachedTo: platform.type === PLATFORM_TYPES.MOVING ? platform : null,
        }),
      );
    }
  }

  coinTrail(y) {
    const n = this.rng.int(3, 5);
    const x0 = this.rng.range(this.left + 50, this.right - 50);
    const dir = this.rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const cx = Math.max(this.left + 24, Math.min(this.right - 24, x0 + dir * i * 28));
      this.world.coins.push(new Coin(cx, y - 60 - i * 38));
    }
  }
}
