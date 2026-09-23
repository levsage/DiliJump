import { PLATFORM, PLATFORM_TYPES } from '../config/constants.js';

export class Platform {
  constructor(x, y, type = PLATFORM_TYPES.NORMAL, opts = {}) {
    this.x = x; // left
    this.y = y; // top
    this.w = PLATFORM.WIDTH;
    this.h = PLATFORM.HEIGHT;
    this.type = type;
    this.vx = opts.vx ?? 0;
    this.broken = false;
    this.used = false;
    this.fade = 1;
    this.vy = 0;
    this.rot = 0;
    this.bounceAnim = 0;
    this.dead = false;
  }

  /** Whether the player can land on this platform. */
  get solid() {
    return !this.broken && !(this.type === PLATFORM_TYPES.VANISHING && this.used);
  }

  onLand() {
    this.bounceAnim = 1;
    if (this.type === PLATFORM_TYPES.VANISHING) this.used = true;
  }

  breakApart() {
    this.broken = true;
    this.vy = 60;
  }

  update(dt, worldWidth) {
    if (this.type === PLATFORM_TYPES.MOVING && !this.broken) {
      this.x += this.vx * dt;
      if (this.x < 0) {
        this.x = 0;
        this.vx = Math.abs(this.vx);
      } else if (this.x + this.w > worldWidth) {
        this.x = worldWidth - this.w;
        this.vx = -Math.abs(this.vx);
      }
    }
    if (this.broken) {
      this.vy += PLATFORM.BREAK_FALL_GRAVITY * dt;
      this.y += this.vy * dt;
      this.rot += dt * 2;
      this.fade = Math.max(0, this.fade - dt * 1.5);
      if (this.fade <= 0) this.dead = true;
    }
    if (this.type === PLATFORM_TYPES.VANISHING && this.used) {
      this.fade = Math.max(0, this.fade - dt * 4);
      if (this.fade <= 0) this.dead = true;
    }
    this.bounceAnim = Math.max(0, this.bounceAnim - dt * 5);
  }
}
