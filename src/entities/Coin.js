import { COIN, MAGNET } from '../config/constants.js';

/** Collectible DLI coin. Bobs and spins (x-scale) for a 3D feel. */
export class Coin {
  constructor(x, y, { attachedTo = null } = {}) {
    this.x = x;
    this.y = y;
    this.r = COIN.RADIUS;
    this.phase = Math.random() * Math.PI * 2;
    this.attachedTo = attachedTo;
    this.offsetX = attachedTo ? x - attachedTo.x : 0;
    this.collected = false;
    this.collectT = 0;
    this.dead = false;
    /** Pulled by the magnet: flies to the player (and keeps flying once caught). */
    this.magnetized = false;
    this.vx = 0;
    this.vy = 0;
  }

  /** Accelerate towards a point (the player) — called every frame while magnetized. */
  pullTowards(tx, ty, dt) {
    this.magnetized = true;
    this.attachedTo = null;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx += (dx / dist) * MAGNET.ACCEL * dt;
    this.vy += (dy / dist) * MAGNET.ACCEL * dt;
    // steer: bleed off sideways speed so coins home in instead of orbiting
    const along = (this.vx * dx + this.vy * dy) / dist;
    const k = Math.min(1, dt * 6);
    this.vx += ((dx / dist) * along - this.vx) * k;
    this.vy += ((dy / dist) * along - this.vy) * k;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAGNET.MAX_SPEED) {
      this.vx *= MAGNET.MAX_SPEED / speed;
      this.vy *= MAGNET.MAX_SPEED / speed;
    }
    // never overshoot the target in one step
    const step = Math.min(1, dist / Math.max(1, speed * dt));
    this.x += this.vx * dt * step;
    this.y += this.vy * dt * step;
  }

  collect() {
    this.collected = true;
  }

  update(dt) {
    this.phase += dt * 4;
    if (this.attachedTo && !this.collected) {
      if (this.attachedTo.dead || this.attachedTo.broken) this.attachedTo = null;
      else this.x = this.attachedTo.x + this.offsetX;
    }
    if (this.collected) {
      this.collectT += dt * 3;
      this.y -= dt * 160;
      if (this.collectT >= 1) this.dead = true;
    }
  }

  get bobY() {
    return this.magnetized ? this.y : this.y + Math.sin(this.phase) * 4;
  }
}
