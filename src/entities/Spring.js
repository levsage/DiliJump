import { SPRING } from '../config/constants.js';

/** Spring pad attached to a platform — launches the player very high. */
export class Spring {
  constructor(platform, offsetX) {
    this.platform = platform;
    this.offsetX = offsetX;
    this.w = SPRING.WIDTH;
    this.h = SPRING.HEIGHT;
    /** Seconds since triggered (-1 = not yet), drives the boing animation. */
    this.t = -1;
    this.idle = Math.random() * 10;
    this.dead = false;
  }

  get x() {
    return this.platform.x + this.offsetX;
  }

  get y() {
    return this.platform.y - this.h;
  }

  trigger() {
    this.t = 0;
  }

  update(dt) {
    this.idle += dt;
    if (this.t >= 0) this.t += dt;
    if (this.platform.dead || this.platform.broken) this.dead = true;
  }
}
