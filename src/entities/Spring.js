import { SPRING } from '../config/constants.js';

/** Spring pad attached to a platform — launches the player very high. */
export class Spring {
  constructor(platform, offsetX) {
    this.platform = platform;
    this.offsetX = offsetX;
    this.w = SPRING.WIDTH;
    this.h = SPRING.HEIGHT;
    this.compressed = 0;
    this.dead = false;
  }

  get x() {
    return this.platform.x + this.offsetX;
  }

  get y() {
    return this.platform.y - this.h;
  }

  trigger() {
    this.compressed = 1;
  }

  update(dt) {
    this.compressed = Math.max(0, this.compressed - dt * 3);
    if (this.platform.dead || this.platform.broken) this.dead = true;
  }
}
