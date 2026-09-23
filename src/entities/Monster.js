import { MONSTER } from '../config/constants.js';

/** Hovering "glitch bug" enemy. Stomp it from above or shoot it. */
export class Monster {
  constructor(x, y, { vx = 0 } = {}) {
    this.x = x; // centre
    this.y = y; // centre
    this.baseY = y;
    this.w = MONSTER.WIDTH;
    this.h = MONSTER.HEIGHT;
    this.vx = vx;
    this.t = Math.random() * 10;
    this.alive = true;
    this.deathT = 0;
    this.dead = false;
  }

  get hitbox() {
    return {
      x: this.x - this.w / 2 + 6,
      y: this.y - this.h / 2 + 6,
      w: this.w - 12,
      h: this.h - 12,
    };
  }

  kill() {
    this.alive = false;
  }

  update(dt, worldWidth) {
    this.t += dt;
    if (this.alive) {
      this.x += this.vx * dt;
      if (this.x < this.w / 2 || this.x > worldWidth - this.w / 2) this.vx *= -1;
      this.y = this.baseY + Math.sin(this.t * 3) * 8;
    } else {
      this.deathT += dt;
      this.y += 600 * dt * this.deathT * 3;
      if (this.deathT > 1.2) this.dead = true;
    }
  }
}
