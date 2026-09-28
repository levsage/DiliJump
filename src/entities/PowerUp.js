import { MAGNET } from '../config/constants.js';

/**
 * Power-up waiting above a platform (currently only the coin magnet).
 * Rides along with moving platforms and bobs gently until collected.
 */
export class PowerUp {
  constructor(x, y, { type = 'magnet', attachedTo = null } = {}) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.r = MAGNET.SIZE / 2 + 6; // pickup radius
    this.phase = Math.random() * Math.PI * 2;
    this.attachedTo = attachedTo;
    this.offsetX = attachedTo ? x - attachedTo.x : 0;
    this.collected = false;
    this.collectT = 0;
    this.dead = false;
  }

  collect() {
    this.collected = true;
  }

  update(dt) {
    this.phase += dt * 3;
    if (this.attachedTo && !this.collected) {
      if (this.attachedTo.dead || this.attachedTo.broken) this.dead = true;
      else this.x = this.attachedTo.x + this.offsetX;
    }
    if (this.collected) {
      this.collectT += dt * 3;
      if (this.collectT >= 1) this.dead = true;
    }
  }

  get bobY() {
    return this.y + Math.sin(this.phase) * 5;
  }
}
