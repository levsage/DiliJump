import { COIN } from '../config/constants.js';

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
    return this.y + Math.sin(this.phase) * 4;
  }
}
